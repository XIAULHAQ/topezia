<?php
/**
 * Plugin Name: Topezia Chat
 * Plugin URI: https://www.topezia.com
 * Description: AI chat for your website that answers from your own pages and sends every real lead to your Topezia inbox. Paste your site key and you're live.
 * Version: 1.0.0
 * Requires at least: 5.8
 * Requires PHP: 7.2
 * Author: Topezia
 * Author URI: https://www.topezia.com
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: topezia-chat
 *
 * The plugin is deliberately thin: everything real happens inside an iframe
 * served by topezia.com. This file stores one option (the site key) and
 * enqueues one script. The less code that runs on the customer's WordPress,
 * the less there is to break on the customer's WordPress.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'TOPEZIA_CHAT_VERSION', '1.0.0' );
define( 'TOPEZIA_CHAT_OPTION', 'topezia_chat_site_key' );

/**
 * The site key as minted by Topezia: URL-safe base64, 10-64 chars.
 * Anything else is refused rather than printed into the page.
 */
function topezia_chat_sanitize_key( $value ) {
	$value = is_string( $value ) ? trim( $value ) : '';
	if ( '' === $value ) {
		return '';
	}
	if ( ! preg_match( '/^[A-Za-z0-9_-]{10,64}$/', $value ) ) {
		add_settings_error(
			TOPEZIA_CHAT_OPTION,
			'topezia_chat_bad_key',
			__( 'That does not look like a Topezia site key. Copy it from your Site chat page on topezia.com.', 'topezia-chat' )
		);
		return get_option( TOPEZIA_CHAT_OPTION, '' );
	}
	return $value;
}

function topezia_chat_register_settings() {
	register_setting(
		'topezia_chat',
		TOPEZIA_CHAT_OPTION,
		array(
			'type'              => 'string',
			'sanitize_callback' => 'topezia_chat_sanitize_key',
			'default'           => '',
		)
	);
}
add_action( 'admin_init', 'topezia_chat_register_settings' );

function topezia_chat_add_settings_page() {
	add_options_page(
		__( 'Topezia Chat', 'topezia-chat' ),
		__( 'Topezia Chat', 'topezia-chat' ),
		'manage_options',
		'topezia-chat',
		'topezia_chat_render_settings_page'
	);
}
add_action( 'admin_menu', 'topezia_chat_add_settings_page' );

function topezia_chat_render_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$key = get_option( TOPEZIA_CHAT_OPTION, '' );
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Topezia Chat', 'topezia-chat' ); ?></h1>
		<p>
			<?php esc_html_e( 'The chat answers visitors from your own website content and sends every real lead to your Topezia inbox.', 'topezia-chat' ); ?>
			<a href="https://www.topezia.com/employer/widget" target="_blank" rel="noopener">
				<?php esc_html_e( 'Get your site key and manage the widget on Topezia →', 'topezia-chat' ); ?>
			</a>
		</p>
		<form action="options.php" method="post">
			<?php settings_fields( 'topezia_chat' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row">
						<label for="topezia_chat_site_key"><?php esc_html_e( 'Site key', 'topezia-chat' ); ?></label>
					</th>
					<td>
						<input
							type="text"
							id="topezia_chat_site_key"
							name="<?php echo esc_attr( TOPEZIA_CHAT_OPTION ); ?>"
							value="<?php echo esc_attr( $key ); ?>"
							class="regular-text code"
							placeholder="<?php esc_attr_e( 'Paste your site key', 'topezia-chat' ); ?>"
						/>
						<p class="description">
							<?php esc_html_e( 'Found on your Site chat page at topezia.com. Leave empty to turn the chat off.', 'topezia-chat' ); ?>
						</p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
		<?php if ( $key ) : ?>
			<p><strong><?php esc_html_e( 'The chat bubble is live on your site.', 'topezia-chat' ); ?></strong></p>
		<?php endif; ?>
	</div>
	<?php
}

/** "Settings" link on the Plugins screen, where people actually look. */
function topezia_chat_action_links( $links ) {
	$settings = sprintf(
		'<a href="%s">%s</a>',
		esc_url( admin_url( 'options-general.php?page=topezia-chat' ) ),
		esc_html__( 'Settings', 'topezia-chat' )
	);
	array_unshift( $links, $settings );
	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'topezia_chat_action_links' );

/**
 * The one thing this plugin does on the public site: load the Topezia
 * widget loader, async, in the footer. Skipped everywhere it would be
 * noise — admin, feeds, embeds, previews, and whenever no key is set.
 */
function topezia_chat_enqueue() {
	if ( is_feed() || is_embed() || is_preview() ) {
		return;
	}
	$key = get_option( TOPEZIA_CHAT_OPTION, '' );
	if ( '' === $key || ! preg_match( '/^[A-Za-z0-9_-]{10,64}$/', $key ) ) {
		return;
	}
	wp_enqueue_script(
		'topezia-chat',
		'https://www.topezia.com/widget.js',
		array(),
		TOPEZIA_CHAT_VERSION,
		true
	);
}
add_action( 'wp_enqueue_scripts', 'topezia_chat_enqueue' );

/** Add async + the site key to the enqueued tag (5.8-compatible). */
function topezia_chat_script_tag( $tag, $handle ) {
	if ( 'topezia-chat' !== $handle ) {
		return $tag;
	}
	$key = get_option( TOPEZIA_CHAT_OPTION, '' );
	return str_replace(
		' src=',
		' async data-topezia="' . esc_attr( $key ) . '" src=',
		$tag
	);
}
add_filter( 'script_loader_tag', 'topezia_chat_script_tag', 10, 2 );
