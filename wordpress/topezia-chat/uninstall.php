<?php
/**
 * Uninstall cleanup: the plugin stores exactly one option; remove it.
 * Nothing else of ours lives in this WordPress.
 */
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'topezia_chat_site_key' );
