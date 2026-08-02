<?php
/**
 * Deleting the plugin removes everything it stored HERE, and nothing else.
 *
 * The Topezia account, the leads and the conversations are not this plugin's
 * to delete. Somebody uninstalling a plugin is tidying their website; they
 * are not asking us to destroy their customer records, and a plugin that
 * treated those as the same act would deserve every word of the review it
 * got.
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

$topezia_options = array(
	'topezia_chat_site_key',
	'topezia_chat_plugin_key',
	'topezia_chat_handshake',
	'topezia_chat_settings',
	'topezia_chat_do_welcome',
);

foreach ( $topezia_options as $topezia_option ) {
	delete_option( $topezia_option );
}

delete_transient( 'topezia_chat_status' );
delete_transient( 'topezia_chat_notice' );
