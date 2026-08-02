<?php
/**
 * What this WordPress site already knows about itself.
 *
 * The whole point of the plugin being a plugin rather than a snippet: a
 * business owner has already typed their name, tagline, logo, address and
 * phone number into WordPress and WooCommerce. Asking them to type it all
 * again into a signup form is the reason most signups are abandoned.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It doesn't read posts, pages, users,
 * orders, customers or anything belonging to a visitor. It reads the site's
 * own public identity — the parts already printed in the site's header,
 * footer and contact page — plus the admin email, which is shown on screen
 * before it goes anywhere. It never runs on a front-end request.
 *
 * The deep reading of page CONTENT is done by Topezia's crawler, from the
 * public site, exactly as any visitor would. That division is on purpose: a
 * plugin with database access to every post is a much larger promise than
 * this one needs to make.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The site's own "about" text, best effort.
 *
 * Looks for the page people actually write it on. Falls back to the tagline,
 * and to nothing at all — a site with no about page connects perfectly well,
 * it just has one less field prefilled.
 */
function topezia_chat_detect_about() {
	$slugs = array( 'about', 'about-us', 'our-story', 'who-we-are', 'company' );
	foreach ( $slugs as $slug ) {
		$page = get_page_by_path( $slug );
		if ( ! $page || 'publish' !== $page->post_status ) {
			continue;
		}
		$text = wp_strip_all_tags( strip_shortcodes( $page->post_content ) );
		$text = trim( preg_replace( '/\s*\n\s*\n\s*/', "\n\n", $text ) );
		if ( strlen( $text ) > 80 ) {
			// Enough to be a real description, short enough to read on the
			// approval screen without scrolling forever.
			return topezia_chat_trim_words( $text, 2000 );
		}
	}
	return '';
}

/** Cut on a word boundary rather than mid-syllable. */
function topezia_chat_trim_words( $text, $max ) {
	if ( strlen( $text ) <= $max ) {
		return $text;
	}
	$cut = substr( $text, 0, $max );
	$sp  = strrpos( $cut, ' ' );
	return ( false === $sp ? $cut : substr( $cut, 0, $sp ) ) . '…';
}

/**
 * The logo, as a URL Topezia can fetch. Custom logo first — that's the one
 * the theme prints in the header — then the site icon, which is at least
 * always square.
 */
function topezia_chat_detect_logo() {
	$id = (int) get_theme_mod( 'custom_logo' );
	if ( $id ) {
		$src = wp_get_attachment_image_src( $id, 'full' );
		if ( ! empty( $src[0] ) ) {
			return $src[0];
		}
	}
	$icon = get_site_icon_url( 512 );
	return $icon ? $icon : '';
}

/**
 * Phone and postal address. WooCommerce stores are the reliable case: the
 * store address is a required setting, so it's there and it's correct.
 * A non-shop site usually has neither in the database at all, and guessing
 * from page content is Topezia's crawler's job, not ours.
 */
function topezia_chat_detect_contact() {
	$out = array( 'phone' => '', 'address' => '', 'email' => '', 'store' => '', 'currency' => '' );

	if ( class_exists( 'WooCommerce' ) ) {
		$out['store']    = 'woocommerce';
		$out['currency'] = function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : '';
		$out['email']    = (string) get_option( 'woocommerce_email_from_address', '' );
		$parts           = array_filter(
			array(
				(string) get_option( 'woocommerce_store_address', '' ),
				(string) get_option( 'woocommerce_store_address_2', '' ),
				(string) get_option( 'woocommerce_store_city', '' ),
				(string) get_option( 'woocommerce_store_postcode', '' ),
			)
		);
		$out['address']  = implode( ', ', $parts );
	}

	if ( ! $out['email'] ) {
		$out['email'] = (string) get_option( 'admin_email', '' );
	}

	return $out;
}

/**
 * Everything, as the API expects it. Shown to the person on the approval
 * screen at topezia.com before any of it is used, and every field there is
 * refusable — so this function's job is to be generous, not cautious.
 */
function topezia_chat_site_profile() {
	$contact = topezia_chat_detect_contact();
	$about   = topezia_chat_detect_about();

	$counts = array(
		'posts'    => (int) wp_count_posts( 'post' )->publish,
		'pages'    => (int) wp_count_posts( 'page' )->publish,
		'products' => post_type_exists( 'product' ) ? (int) wp_count_posts( 'product' )->publish : 0,
	);

	return array(
		'name'     => get_bloginfo( 'name' ),
		'tagline'  => get_bloginfo( 'description' ),
		'about'    => $about ? $about : get_bloginfo( 'description' ),
		'email'    => $contact['email'],
		'phone'    => $contact['phone'],
		'address'  => $contact['address'],
		'logoUrl'  => topezia_chat_detect_logo(),
		'locale'   => get_locale(),
		'store'    => $contact['store'],
		'currency' => $contact['currency'],
		'wp'       => get_bloginfo( 'version' ),
		'php'      => PHP_VERSION,
		'plugin'   => TOPEZIA_CHAT_VERSION,
		'posts'    => $counts['posts'],
		'pages'    => $counts['pages'],
		'products' => $counts['products'],
	);
}

/**
 * The same profile, described for a human. This is what the plugin shows
 * BEFORE the connect button, because "we will send some information about
 * your site" is not informed consent and a list of the actual values is.
 */
function topezia_chat_profile_rows( $profile ) {
	$rows = array(
		__( 'Website address', 'topezia-chat' ) => home_url(),
		__( 'Site name', 'topezia-chat' )       => $profile['name'],
		__( 'Tagline', 'topezia-chat' )         => $profile['tagline'],
		__( 'About text', 'topezia-chat' )      => $profile['about'],
		__( 'Contact email', 'topezia-chat' )   => $profile['email'],
		__( 'Address', 'topezia-chat' )         => $profile['address'],
		__( 'Logo', 'topezia-chat' )            => $profile['logoUrl'],
		__( 'Language', 'topezia-chat' )        => $profile['locale'],
		__( 'WordPress / PHP', 'topezia-chat' ) => $profile['wp'] . ' / ' . $profile['php'],
	);
	if ( $profile['store'] ) {
		$rows[ __( 'Store', 'topezia-chat' ) ] = sprintf(
			/* translators: 1: currency code, 2: number of products */
			__( 'WooCommerce (%1$s, %2$s products)', 'topezia-chat' ),
			$profile['currency'],
			number_format_i18n( $profile['products'] )
		);
	}
	return array_filter( $rows, 'strlen' );
}
