<?php
/**
 * The only thing that runs on the public site: one async script tag.
 *
 * Kept deliberately tiny. Every line here runs on every page view of
 * somebody's business, so it does two option reads and some cheap
 * conditionals, and nothing else. No styles are enqueued, no shortcode is
 * registered, no query is made.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Should the bubble appear on the request being served right now? */
function topezia_chat_should_render() {
	// Contexts where a chat bubble is noise rather than help.
	if ( is_feed() || is_embed() || is_preview() || is_404() ) {
		return false;
	}
	if ( ! topezia_chat_site_key() ) {
		return false;
	}

	$settings = topezia_chat_settings();
	if ( empty( $settings['enabled'] ) ) {
		return false;
	}

	// Over the pay button is the one place a chat bubble costs money rather
	// than making it, so this is offered as a setting and off by default —
	// plenty of shops want exactly the opposite.
	if ( ! empty( $settings['skip_checkout'] ) && function_exists( 'is_checkout' ) ) {
		if ( is_checkout() || ( function_exists( 'is_cart' ) && is_cart() ) ) {
			return false;
		}
	}

	if ( ! empty( $settings['exclude'] ) && is_singular() ) {
		$id = get_queried_object_id();
		if ( $id && in_array( (int) $id, array_map( 'intval', (array) $settings['exclude'] ), true ) ) {
			return false;
		}
	}

	/**
	 * Last word to the site owner's own code. A theme or snippet can hide
	 * the chat anywhere it likes without touching this plugin.
	 *
	 * @param bool $show Whether to print the loader on this request.
	 */
	return (bool) apply_filters( 'topezia_chat_show', true );
}

function topezia_chat_enqueue() {
	if ( ! topezia_chat_should_render() ) {
		return;
	}
	wp_enqueue_script(
		'topezia-chat',
		topezia_chat_api_base() . '/widget.js',
		array(),
		TOPEZIA_CHAT_VERSION,
		true
	);
}
add_action( 'wp_enqueue_scripts', 'topezia_chat_enqueue' );

/**
 * Add async and the site key to the tag.
 *
 * Written against script_loader_tag rather than wp_script_add_data( 'async' )
 * because that only landed in WordPress 6.3 and this plugin supports 5.8.
 */
function topezia_chat_script_tag( $tag, $handle ) {
	if ( 'topezia-chat' !== $handle ) {
		return $tag;
	}
	$key = topezia_chat_site_key();
	if ( ! $key ) {
		return $tag;
	}
	return str_replace( ' src=', ' async data-topezia="' . esc_attr( $key ) . '" src=', $tag );
}
add_filter( 'script_loader_tag', 'topezia_chat_script_tag', 10, 2 );
