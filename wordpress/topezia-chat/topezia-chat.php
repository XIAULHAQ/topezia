<?php
/**
 * Plugin Name: Topezia Chat — AI Chatbot & Lead Capture
 * Plugin URI: https://www.topezia.com/free-ai-chatbot
 * Description: An AI chat bubble that answers visitors from your own pages, captures leads and emails them to you. Connect in one click — your logo, contact details and about text are picked up automatically.
 * Version: 2.0.0
 * Requires at least: 5.8
 * Requires PHP: 7.2
 * Author: Topezia
 * Author URI: https://www.topezia.com
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: topezia-chat
 * Domain Path: /languages
 *
 * WHAT RUNS WHERE, AND WHY IT MATTERS.
 *
 * On the public site this plugin adds exactly one thing: an async <script>
 * tag. No styles, no shortcodes, no database reads beyond two options, no
 * work on any request that isn't a page view. Everything the chat actually
 * does happens inside an iframe served by topezia.com. The less of ours that
 * runs on a customer's site, the less of theirs we can break.
 *
 * In wp-admin it does more, because connecting an account is a real job:
 * it reads what the site already knows about itself (name, logo, about page,
 * contact details, WooCommerce settings) and offers it, so nobody has to
 * retype what WordPress already stores.
 *
 * NOTHING LEAVES THIS SITE UNTIL SOMEONE PRESSES CONNECT. No pings, no
 * telemetry, no phoning home on activation. After connecting, the plugin
 * asks topezia.com for its own status — see readme.txt, "External services".
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'TOPEZIA_CHAT_VERSION', '2.0.0' );
define( 'TOPEZIA_CHAT_FILE', __FILE__ );
define( 'TOPEZIA_CHAT_DIR', plugin_dir_path( __FILE__ ) );
define( 'TOPEZIA_CHAT_URL', plugin_dir_url( __FILE__ ) );

/**
 * Where the service lives. Filterable so a self-hosted or staging Topezia can
 * be pointed at without editing the plugin — the WordPress way, and it keeps
 * this file free of magic strings.
 */
function topezia_chat_api_base() {
	$base = apply_filters( 'topezia_chat_api_base', 'https://www.topezia.com' );
	return untrailingslashit( esc_url_raw( $base ) );
}

/** The public key in the embed. Identifies the site; authorizes nothing. */
define( 'TOPEZIA_CHAT_OPTION', 'topezia_chat_site_key' );
/** The plugin's own credential. Read-only, and revoked by disconnecting. */
define( 'TOPEZIA_CHAT_PLUGIN_KEY', 'topezia_chat_plugin_key' );
/** In-flight handshake: state + one-time claim token. Deleted once used. */
define( 'TOPEZIA_CHAT_HANDSHAKE', 'topezia_chat_handshake' );
/** Display settings that are ours to decide locally. */
define( 'TOPEZIA_CHAT_SETTINGS', 'topezia_chat_settings' );
/** Cached account status, so the dashboard doesn't call out on every view. */
define( 'TOPEZIA_CHAT_STATUS', 'topezia_chat_status' );

require_once TOPEZIA_CHAT_DIR . 'includes/detect.php';
require_once TOPEZIA_CHAT_DIR . 'includes/api.php';
require_once TOPEZIA_CHAT_DIR . 'includes/frontend.php';
if ( is_admin() ) {
	require_once TOPEZIA_CHAT_DIR . 'includes/admin.php';
}

/**
 * The site key as Topezia mints it: URL-safe base64, 10-64 characters.
 * Anything else is refused rather than printed into a page.
 */
function topezia_chat_valid_key( $value ) {
	return is_string( $value ) && preg_match( '/^[A-Za-z0-9_-]{10,64}$/', $value );
}

function topezia_chat_site_key() {
	$key = get_option( TOPEZIA_CHAT_OPTION, '' );
	return topezia_chat_valid_key( $key ) ? $key : '';
}

function topezia_chat_settings() {
	$saved = get_option( TOPEZIA_CHAT_SETTINGS, array() );
	return wp_parse_args(
		is_array( $saved ) ? $saved : array(),
		array(
			'enabled'  => true,
			// Post/page IDs the bubble is hidden on. Empty = everywhere.
			'exclude'  => array(),
			// WooCommerce cart and checkout, where a chat bubble over the
			// pay button is a conversion problem rather than a help.
			'skip_checkout' => false,
		)
	);
}

/** Everything the plugin stores, in one place, so uninstall can be exact. */
function topezia_chat_option_names() {
	return array(
		TOPEZIA_CHAT_OPTION,
		TOPEZIA_CHAT_PLUGIN_KEY,
		TOPEZIA_CHAT_HANDSHAKE,
		TOPEZIA_CHAT_SETTINGS,
		TOPEZIA_CHAT_STATUS,
	);
}

/**
 * On activation, send the person to the setup screen once — the single most
 * common reason a plugin never gets configured is that nobody finds it.
 * A flag, not a redirect from the activation hook itself: bulk activation
 * must not hijack the browser.
 */
function topezia_chat_activate() {
	if ( ! topezia_chat_site_key() ) {
		add_option( 'topezia_chat_do_welcome', 1 );
	}
}
register_activation_hook( __FILE__, 'topezia_chat_activate' );
