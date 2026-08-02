<?php
/**
 * Talking to topezia.com, from this server.
 *
 * Every call here is server-to-server via wp_remote_post. That is the whole
 * security argument of the connect flow: THE SITE KEY NEVER TRAVELS THROUGH
 * A BROWSER URL. The person's browser carries only `state`, which authorizes
 * nothing; this file holds the one-time claim token and exchanges it for the
 * key over TLS between two servers.
 *
 * Every function returns either data or a WP_Error whose message is fit to
 * show a human. A plugin that renders "cURL error 28" at a shop owner has
 * told them nothing they can act on.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** One place for the request, so timeouts and headers can't drift apart. */
function topezia_chat_post( $path, $body, $timeout = 20 ) {
	$res = wp_remote_post(
		topezia_chat_api_base() . $path,
		array(
			'timeout' => $timeout,
			'headers' => array(
				'Content-Type' => 'application/json',
				'Accept'       => 'application/json',
			),
			'body'    => wp_json_encode( $body ),
		)
	);

	if ( is_wp_error( $res ) ) {
		return new WP_Error(
			'topezia_network',
			__( "Couldn't reach topezia.com from this server. If your host blocks outgoing connections, allow www.topezia.com and try again.", 'topezia-chat' )
		);
	}

	$code = (int) wp_remote_retrieve_response_code( $res );
	$data = json_decode( wp_remote_retrieve_body( $res ), true );
	if ( ! is_array( $data ) ) {
		return new WP_Error( 'topezia_response', __( 'Topezia sent an answer this plugin could not read. Try again shortly.', 'topezia-chat' ) );
	}

	if ( $code >= 400 && ! empty( $data['error'] ) ) {
		// The service writes these for humans, so pass them through rather
		// than replacing them with something vaguer.
		return new WP_Error( 'topezia_' . $code, (string) $data['error'], array( 'data' => $data ) );
	}
	if ( $code >= 400 ) {
		return new WP_Error( 'topezia_' . $code, __( 'Topezia refused that request. Try again shortly.', 'topezia-chat' ) );
	}

	return $data;
}

/**
 * Step one: register the connection and get somewhere to send the person.
 * Stores the one-time claim token locally; it is the only thing that can
 * later collect the key.
 */
function topezia_chat_start_connect() {
	$profile = topezia_chat_site_profile();

	$data = topezia_chat_post(
		'/api/connect/wordpress/start',
		array(
			'site_url'   => home_url(),
			'return_url' => admin_url( 'admin.php?page=topezia-chat&topezia_return=1' ),
			'details'    => $profile,
		)
	);
	if ( is_wp_error( $data ) ) {
		return $data;
	}
	if ( empty( $data['state'] ) || empty( $data['claim_token'] ) || empty( $data['authorize_url'] ) ) {
		return new WP_Error( 'topezia_response', __( 'Topezia did not return a connection link. Try again shortly.', 'topezia-chat' ) );
	}

	update_option(
		TOPEZIA_CHAT_HANDSHAKE,
		array(
			'state'   => (string) $data['state'],
			'token'   => (string) $data['claim_token'],
			'started' => time(),
		),
		false // never autoloaded: it is short-lived and secret-ish
	);

	return (string) $data['authorize_url'];
}

/**
 * Step two: collect the keys, once the person has approved.
 *
 * Three outcomes the caller must tell apart: 'pending' (they haven't
 * finished — keep waiting), success (store and celebrate), and WP_Error
 * (stop and explain). Anything that conflates the first two spins forever.
 */
function topezia_chat_claim_connect() {
	$hs = get_option( TOPEZIA_CHAT_HANDSHAKE, array() );
	if ( empty( $hs['state'] ) || empty( $hs['token'] ) ) {
		return new WP_Error( 'topezia_no_handshake', __( 'There is no connection in progress. Press Connect to start one.', 'topezia-chat' ) );
	}

	$data = topezia_chat_post(
		'/api/connect/wordpress/claim',
		array(
			'state'       => $hs['state'],
			'claim_token' => $hs['token'],
		)
	);

	if ( is_wp_error( $data ) ) {
		// A dead handshake is worth clearing so the UI offers a fresh start
		// rather than a Check-again button that can never succeed.
		$code = $data->get_error_code();
		if ( 'topezia_404' === $code || 'topezia_410' === $code ) {
			delete_option( TOPEZIA_CHAT_HANDSHAKE );
		}
		return $data;
	}

	if ( isset( $data['status'] ) && 'pending' === $data['status'] ) {
		return 'pending';
	}
	if ( empty( $data['site_key'] ) || ! topezia_chat_valid_key( $data['site_key'] ) ) {
		return new WP_Error( 'topezia_response', __( 'Topezia did not return a usable site key. Try connecting again.', 'topezia-chat' ) );
	}

	update_option( TOPEZIA_CHAT_OPTION, (string) $data['site_key'] );
	if ( ! empty( $data['plugin_key'] ) ) {
		update_option( TOPEZIA_CHAT_PLUGIN_KEY, (string) $data['plugin_key'], false );
	}
	delete_option( TOPEZIA_CHAT_HANDSHAKE );
	delete_transient( TOPEZIA_CHAT_STATUS );

	return $data;
}

/**
 * The dashboard numbers. Cached for five minutes because a WordPress admin
 * refreshes a lot and none of these figures move that fast.
 *
 * Authenticated with the PLUGIN key, never the site key: the site key is in
 * every visitor's page source, and "how many leads did I get?" is not a
 * question to answer to whoever views source.
 */
function topezia_chat_status( $force = false ) {
	$key = get_option( TOPEZIA_CHAT_PLUGIN_KEY, '' );
	if ( ! $key ) {
		return null; // connected by hand, or upgraded from 1.x — no stats
	}

	if ( ! $force ) {
		$cached = get_transient( TOPEZIA_CHAT_STATUS );
		if ( is_array( $cached ) ) {
			return $cached;
		}
	}

	$data = topezia_chat_post( '/api/connect/wordpress/status', array( 'plugin_key' => $key ), 12 );
	if ( is_wp_error( $data ) ) {
		// A blip must not blank the dashboard. Keep whatever we last knew
		// and let the page say it's showing cached figures.
		$stale = get_transient( TOPEZIA_CHAT_STATUS );
		return is_array( $stale ) ? $stale : null;
	}

	set_transient( TOPEZIA_CHAT_STATUS, $data, 5 * MINUTE_IN_SECONDS );
	return $data;
}
