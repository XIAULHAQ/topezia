<?php
/**
 * The admin experience: one menu, three states, no dead ends.
 *
 * The three states are the whole design. NOT CONNECTED shows what will be
 * sent and one button. WAITING appears only if someone comes back before
 * approving, and checks by itself so nobody is left pressing refresh.
 * CONNECTED is a dashboard with real numbers from the account, the settings
 * that genuinely belong on this side, and a way out.
 *
 * Everything that could change something is a POST behind a nonce and a
 * manage_options check. Every value printed is escaped at the point of
 * printing, including values that came back from our own API — an API we
 * control is still a remote server, and "it's ours" is how stored XSS gets
 * shipped.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const TOPEZIA_CHAT_PAGE = 'topezia-chat';

/* -------------------------------------------------------------------------
 * Menu and assets
 * ---------------------------------------------------------------------- */

function topezia_chat_menu() {
	$badge = '';
	$status = get_transient( TOPEZIA_CHAT_STATUS );
	if ( is_array( $status ) && ! empty( $status['unanswered'] ) ) {
		$badge = ' <span class="update-plugins count-' . (int) $status['unanswered'] . '"><span class="update-count">'
			. number_format_i18n( (int) $status['unanswered'] ) . '</span></span>';
	}

	add_menu_page(
		__( 'Topezia Chat', 'topezia-chat' ),
		__( 'Topezia', 'topezia-chat' ) . $badge,
		'manage_options',
		TOPEZIA_CHAT_PAGE,
		'topezia_chat_render',
		'dashicons-format-chat',
		58
	);
}
add_action( 'admin_menu', 'topezia_chat_menu' );

function topezia_chat_admin_assets( $hook ) {
	if ( 'toplevel_page_' . TOPEZIA_CHAT_PAGE !== $hook ) {
		return;
	}
	wp_enqueue_style( 'topezia-chat-admin', TOPEZIA_CHAT_URL . 'assets/admin.css', array(), TOPEZIA_CHAT_VERSION );
	wp_enqueue_script( 'topezia-chat-admin', TOPEZIA_CHAT_URL . 'assets/admin.js', array(), TOPEZIA_CHAT_VERSION, true );
	wp_localize_script(
		'topezia-chat-admin',
		'topeziaChat',
		array(
			'ajaxUrl' => admin_url( 'admin-ajax.php' ),
			'nonce'   => wp_create_nonce( 'topezia_poll' ),
			'waiting' => __( 'Still waiting for you to finish on topezia.com…', 'topezia-chat' ),
		)
	);
}
add_action( 'admin_enqueue_scripts', 'topezia_chat_admin_assets' );

/** "Settings" on the Plugins screen, where people actually look. */
function topezia_chat_action_links( $links ) {
	array_unshift(
		$links,
		sprintf(
			'<a href="%s">%s</a>',
			esc_url( admin_url( 'admin.php?page=' . TOPEZIA_CHAT_PAGE ) ),
			esc_html( topezia_chat_site_key() ? __( 'Dashboard', 'topezia-chat' ) : __( 'Set up', 'topezia-chat' ) )
		)
	);
	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( TOPEZIA_CHAT_FILE ), 'topezia_chat_action_links' );

/** One trip to the setup screen after activation, then never again. */
function topezia_chat_welcome_redirect() {
	if ( ! get_option( 'topezia_chat_do_welcome' ) ) {
		return;
	}
	delete_option( 'topezia_chat_do_welcome' );
	if ( ! current_user_can( 'manage_options' ) || wp_doing_ajax() ) {
		return;
	}
	// Never hijack a bulk activation.
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended
	if ( isset( $_GET['activate-multi'] ) ) {
		return;
	}
	wp_safe_redirect( admin_url( 'admin.php?page=' . TOPEZIA_CHAT_PAGE ) );
	exit;
}
add_action( 'admin_init', 'topezia_chat_welcome_redirect' );

/* -------------------------------------------------------------------------
 * Actions
 * ---------------------------------------------------------------------- */

function topezia_chat_notice( $type, $message ) {
	set_transient( 'topezia_chat_notice', array( 'type' => $type, 'text' => $message ), 60 );
}

function topezia_chat_back( $args = array() ) {
	wp_safe_redirect( add_query_arg( $args, admin_url( 'admin.php?page=' . TOPEZIA_CHAT_PAGE ) ) );
	exit;
}

/** Start the handshake and hand the browser to topezia.com. */
function topezia_chat_handle_connect() {
	check_admin_referer( 'topezia_connect' );
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You do not have permission to do that.', 'topezia-chat' ) );
	}

	$url = topezia_chat_start_connect();
	if ( is_wp_error( $url ) ) {
		topezia_chat_notice( 'error', $url->get_error_message() );
		topezia_chat_back();
	}

	// Off-site by design, so wp_safe_redirect (same-host only) is wrong here.
	// The URL came from our own API response and is escaped as a URL.
	wp_redirect( esc_url_raw( $url ) ); // phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect
	exit;
}
add_action( 'admin_post_topezia_connect', 'topezia_chat_handle_connect' );

/** Collect the keys. Used by the return trip and by the Check again button. */
function topezia_chat_handle_claim() {
	check_admin_referer( 'topezia_claim' );
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You do not have permission to do that.', 'topezia-chat' ) );
	}
	$res = topezia_chat_claim_connect();
	if ( is_wp_error( $res ) ) {
		topezia_chat_notice( 'error', $res->get_error_message() );
	} elseif ( 'pending' === $res ) {
		topezia_chat_notice( 'info', __( 'Not finished yet — approve the connection on topezia.com and come back.', 'topezia-chat' ) );
		topezia_chat_back( array( 'topezia_return' => 1 ) );
	} else {
		topezia_chat_notice( 'success', __( 'Connected. The chat is live on your website.', 'topezia-chat' ) );
	}
	topezia_chat_back();
}
add_action( 'admin_post_topezia_claim', 'topezia_chat_handle_claim' );

/**
 * The automatic check behind the waiting screen. Same work as the button,
 * without a page reload — a person who has just approved on another tab
 * should find this one already finished.
 */
function topezia_chat_ajax_poll() {
	check_ajax_referer( 'topezia_poll', 'nonce' );
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_send_json_error( array( 'message' => __( 'Not allowed.', 'topezia-chat' ) ), 403 );
	}
	$res = topezia_chat_claim_connect();
	if ( is_wp_error( $res ) ) {
		wp_send_json_error( array( 'message' => $res->get_error_message() ) );
	}
	if ( 'pending' === $res ) {
		wp_send_json_success( array( 'state' => 'pending' ) );
	}
	wp_send_json_success( array( 'state' => 'ready' ) );
}
add_action( 'wp_ajax_topezia_poll', 'topezia_chat_ajax_poll' );

/** Local display settings. Nothing here leaves the site. */
function topezia_chat_handle_settings() {
	check_admin_referer( 'topezia_settings' );
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You do not have permission to do that.', 'topezia-chat' ) );
	}

	$hide_on = array();
	if ( isset( $_POST['hide_on'] ) && is_array( $_POST['hide_on'] ) ) {
		$hide_on = array_values( array_filter( array_map( 'intval', wp_unslash( $_POST['hide_on'] ) ) ) );
	}

	update_option(
		TOPEZIA_CHAT_SETTINGS,
		array(
			'enabled'       => ! empty( $_POST['enabled'] ),
			'skip_checkout' => ! empty( $_POST['skip_checkout'] ),
			'hide_on'       => $hide_on,
		)
	);
	topezia_chat_notice( 'success', __( 'Saved.', 'topezia-chat' ) );
	topezia_chat_back();
}
add_action( 'admin_post_topezia_settings', 'topezia_chat_handle_settings' );

/** The escape hatch: paste a key from the Topezia dashboard. */
function topezia_chat_handle_manual() {
	check_admin_referer( 'topezia_manual' );
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You do not have permission to do that.', 'topezia-chat' ) );
	}
	$key = isset( $_POST['site_key'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['site_key'] ) ) ) : '';
	if ( ! topezia_chat_valid_key( $key ) ) {
		topezia_chat_notice( 'error', __( 'That does not look like a Topezia site key. Copy it from the Install tab of your Topezia dashboard.', 'topezia-chat' ) );
		topezia_chat_back();
	}
	update_option( TOPEZIA_CHAT_OPTION, $key );
	// A hand-pasted key is the public one, so there is no read credential and
	// no dashboard figures. Clearing it keeps the UI honest about that.
	delete_option( TOPEZIA_CHAT_PLUGIN_KEY );
	delete_transient( TOPEZIA_CHAT_STATUS );
	topezia_chat_notice( 'success', __( 'Saved. The chat is live on your website.', 'topezia-chat' ) );
	topezia_chat_back();
}
add_action( 'admin_post_topezia_manual', 'topezia_chat_handle_manual' );

/**
 * Disconnect. Local only, and it says so — the account, the leads and the
 * conversations stay where they are, because deleting someone's customer
 * records from a plugin's Remove button would be indefensible.
 */
function topezia_chat_handle_disconnect() {
	check_admin_referer( 'topezia_disconnect' );
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You do not have permission to do that.', 'topezia-chat' ) );
	}
	delete_option( TOPEZIA_CHAT_OPTION );
	delete_option( TOPEZIA_CHAT_PLUGIN_KEY );
	delete_option( TOPEZIA_CHAT_HANDSHAKE );
	delete_transient( TOPEZIA_CHAT_STATUS );
	topezia_chat_notice( 'success', __( 'Disconnected. The chat has been removed from your website — your Topezia account and everything in it is untouched.', 'topezia-chat' ) );
	topezia_chat_back();
}
add_action( 'admin_post_topezia_disconnect', 'topezia_chat_handle_disconnect' );

/* -------------------------------------------------------------------------
 * Rendering
 * ---------------------------------------------------------------------- */

function topezia_chat_render_notice() {
	$notice = get_transient( 'topezia_chat_notice' );
	if ( ! is_array( $notice ) ) {
		return;
	}
	delete_transient( 'topezia_chat_notice' );
	$class = 'error' === $notice['type'] ? 'notice-error' : ( 'info' === $notice['type'] ? 'notice-info' : 'notice-success' );
	printf(
		'<div class="notice %s is-dismissible"><p>%s</p></div>',
		esc_attr( $class ),
		esc_html( $notice['text'] )
	);
}

function topezia_chat_render() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	// phpcs:ignore WordPress.Security.NonceVerification.Recommended
	$returning = isset( $_GET['topezia_return'] );
	$handshake = get_option( TOPEZIA_CHAT_HANDSHAKE, array() );
	$key       = topezia_chat_site_key();

	// Coming back from topezia.com with the approval done: finish the job
	// without making them press anything.
	if ( $returning && ! $key && ! empty( $handshake['state'] ) ) {
		$res = topezia_chat_claim_connect();
		if ( ! is_wp_error( $res ) && 'pending' !== $res ) {
			$key = topezia_chat_site_key();
			topezia_chat_notice( 'success', __( 'Connected. The chat is live on your website.', 'topezia-chat' ) );
		}
	}

	echo '<div class="wrap topezia-wrap">';
	topezia_chat_render_header( $key );
	topezia_chat_render_notice();

	if ( $key ) {
		topezia_chat_render_dashboard( $key );
	} elseif ( ! empty( $handshake['state'] ) && $returning ) {
		topezia_chat_render_waiting();
	} else {
		topezia_chat_render_welcome();
	}

	echo '</div>';
}

function topezia_chat_render_header( $key ) {
	$settings = topezia_chat_settings();
	$live     = $key && ! empty( $settings['enabled'] );
	?>
	<div class="topezia-head">
		<div class="topezia-brand">
			<span class="topezia-logo">T</span>
			<div>
				<h1><?php esc_html_e( 'Topezia Chat', 'topezia-chat' ); ?></h1>
				<p><?php esc_html_e( 'An AI assistant that answers from your own pages and sends you every lead.', 'topezia-chat' ); ?></p>
			</div>
		</div>
		<?php if ( $key ) : ?>
			<span class="topezia-pill <?php echo $live ? 'is-live' : 'is-off'; ?>">
				<span class="topezia-dot"></span>
				<?php echo $live ? esc_html__( 'Live on your site', 'topezia-chat' ) : esc_html__( 'Paused', 'topezia-chat' ); ?>
			</span>
		<?php endif; ?>
	</div>
	<?php
	// WordPress MOVES admin notices at runtime — common.js relocates every
	// .notice to just after the first h1 unless a .wp-header-end marker says
	// where the header stops. Without this, our own notices land inside the
	// brand block and are invisible. Found by pressing Connect and getting a
	// silent page instead of an error.
	echo '<hr class="wp-header-end" />';
}

/** State one: nothing connected yet. */
function topezia_chat_render_welcome() {
	$profile = topezia_chat_site_profile();
	$rows    = topezia_chat_profile_rows( $profile );
	?>
	<div class="topezia-grid">
		<div class="topezia-card topezia-hero">
			<h2><?php esc_html_e( 'Connect in one click', 'topezia-chat' ); ?></h2>
			<p class="topezia-lead">
				<?php esc_html_e( 'Topezia reads your website, then answers visitors from it — accurately, in their language, day and night. When someone is worth talking to, it takes their details and emails them straight to you.', 'topezia-chat' ); ?>
			</p>

			<ul class="topezia-points">
				<li>
					<strong><?php esc_html_e( 'It learns your site by itself.', 'topezia-chat' ); ?></strong>
					<?php esc_html_e( 'Your pages, services and prices — no training, no scripts to write.', 'topezia-chat' ); ?>
				</li>
				<li>
					<strong><?php esc_html_e( 'Every lead reaches you.', 'topezia-chat' ); ?></strong>
					<?php esc_html_e( 'Name, email, phone and the whole conversation, by email and in your inbox.', 'topezia-chat' ); ?>
				</li>
				<li>
					<strong><?php esc_html_e( 'Free forever on one website.', 'topezia-chat' ); ?></strong>
					<?php esc_html_e( 'No card to start. Leads and your inbox are never limited.', 'topezia-chat' ); ?>
				</li>
			</ul>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<?php wp_nonce_field( 'topezia_connect' ); ?>
				<input type="hidden" name="action" value="topezia_connect" />
				<button type="submit" class="topezia-btn topezia-btn-primary">
					<?php esc_html_e( 'Connect to Topezia', 'topezia-chat' ); ?>
				</button>
			</form>
			<p class="topezia-fine">
				<?php esc_html_e( 'Opens topezia.com so you can create your account or sign in. You confirm everything there before anything is saved.', 'topezia-chat' ); ?>
			</p>
		</div>

		<div class="topezia-card">
			<h3><?php esc_html_e( 'What gets sent when you press Connect', 'topezia-chat' ); ?></h3>
			<p class="topezia-muted">
				<?php esc_html_e( 'Read from this site so you do not have to type it again. You can refuse any of it on the next screen, and nothing at all is sent until you press the button.', 'topezia-chat' ); ?>
			</p>
			<table class="topezia-table">
				<?php foreach ( $rows as $label => $value ) : ?>
					<tr>
						<th><?php echo esc_html( $label ); ?></th>
						<td><?php echo esc_html( topezia_chat_shorten( (string) $value, 120 ) ); ?></td>
					</tr>
				<?php endforeach; ?>
			</table>
			<p class="topezia-fine">
				<?php esc_html_e( 'No posts, customers, orders or user accounts are read.', 'topezia-chat' ); ?>
				<a href="https://www.topezia.com/privacy" target="_blank" rel="noopener"><?php esc_html_e( 'Privacy', 'topezia-chat' ); ?></a>
			</p>
		</div>
	</div>

	<?php topezia_chat_render_manual_box(); ?>
	<?php
}

/** State two: they left for topezia.com and came back early. */
function topezia_chat_render_waiting() {
	?>
	<div class="topezia-card topezia-waiting" id="topezia-waiting">
		<div class="topezia-spinner" aria-hidden="true"></div>
		<h2><?php esc_html_e( 'Finish on topezia.com', 'topezia-chat' ); ?></h2>
		<p class="topezia-muted">
			<?php esc_html_e( 'Approve the connection in the other tab and this page will pick it up by itself. You can leave it open.', 'topezia-chat' ); ?>
		</p>
		<div class="topezia-row">
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<?php wp_nonce_field( 'topezia_claim' ); ?>
				<input type="hidden" name="action" value="topezia_claim" />
				<button type="submit" class="topezia-btn topezia-btn-primary"><?php esc_html_e( 'Check now', 'topezia-chat' ); ?></button>
			</form>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<?php wp_nonce_field( 'topezia_connect' ); ?>
				<input type="hidden" name="action" value="topezia_connect" />
				<button type="submit" class="topezia-btn"><?php esc_html_e( 'Start again', 'topezia-chat' ); ?></button>
			</form>
		</div>
	</div>
	<?php
}

/** State three: connected. The dashboard. */
function topezia_chat_render_dashboard( $key ) {
	$status   = topezia_chat_status();
	$settings = topezia_chat_settings();
	$linked   = (bool) get_option( TOPEZIA_CHAT_PLUGIN_KEY, '' );

	if ( is_array( $status ) && ! empty( $status['plan'] ) ) {
		$plan     = $status['plan'];
		$used     = (int) ( $plan['replies_used'] ?? 0 );
		$included = max( 1, (int) ( $plan['replies_included'] ?? 1 ) );
		$pct      = min( 100, (int) round( ( $used / $included ) * 100 ) );
		?>
		<div class="topezia-stats">
			<?php
			topezia_chat_stat(
				__( 'Leads captured', 'topezia-chat' ),
				number_format_i18n( (int) ( $status['leads'] ?? 0 ) ),
				__( 'Since the chat went live', 'topezia-chat' )
			);
			topezia_chat_stat(
				__( 'AI answers this month', 'topezia-chat' ),
				number_format_i18n( $used ) . ' / ' . number_format_i18n( $included ),
				sprintf(
					/* translators: %s: plan name */
					__( 'Included with %s', 'topezia-chat' ),
					(string) ( $plan['name'] ?? 'Free' )
				),
				$pct
			);
			topezia_chat_stat(
				__( 'Pages read', 'topezia-chat' ),
				number_format_i18n( (int) ( $status['site']['pages'] ?? 0 ) ),
				__( 'What the chat can answer from', 'topezia-chat' )
			);
			topezia_chat_stat(
				__( 'Questions it missed', 'topezia-chat' ),
				number_format_i18n( (int) ( $status['unanswered'] ?? 0 ) ),
				__( 'Worth teaching it the answers', 'topezia-chat' )
			);
			?>
		</div>
		<?php
	}

	$dash = topezia_chat_api_base();
	?>
	<div class="topezia-grid">
		<div class="topezia-card">
			<h3><?php esc_html_e( 'Your chat', 'topezia-chat' ); ?></h3>
			<?php if ( is_array( $status ) && ! empty( $status['site']['domain'] ) ) : ?>
				<p class="topezia-muted">
					<?php
					printf(
						/* translators: %s: website domain */
						esc_html__( 'Answering visitors on %s.', 'topezia-chat' ),
						'<strong>' . esc_html( (string) $status['site']['domain'] ) . '</strong>'
					);
					?>
					<?php if ( ! empty( $status['site']['crawl_error'] ) ) : ?>
						<br /><span class="topezia-warn"><?php echo esc_html( (string) $status['site']['crawl_error'] ); ?></span>
					<?php endif; ?>
				</p>
			<?php elseif ( ! $linked ) : ?>
				<p class="topezia-muted">
					<?php esc_html_e( 'Set up with a pasted site key, so this screen cannot show your figures. Reconnect to see leads and usage here.', 'topezia-chat' ); ?>
				</p>
			<?php endif; ?>

			<div class="topezia-actions">
				<a class="topezia-btn topezia-btn-primary" href="<?php echo esc_url( $dash . '/employer/messages' ); ?>" target="_blank" rel="noopener">
					<?php esc_html_e( 'Open my inbox', 'topezia-chat' ); ?>
				</a>
				<a class="topezia-btn" href="<?php echo esc_url( $dash . '/employer/widget' ); ?>" target="_blank" rel="noopener">
					<?php esc_html_e( 'Chat settings', 'topezia-chat' ); ?>
				</a>
				<?php if ( is_array( $status ) && ! empty( $status['unanswered'] ) ) : ?>
					<a class="topezia-btn" href="<?php echo esc_url( $dash . '/employer/widget' ); ?>" target="_blank" rel="noopener">
						<?php esc_html_e( 'Teach it the missed answers', 'topezia-chat' ); ?>
					</a>
				<?php endif; ?>
			</div>

			<p class="topezia-fine">
				<?php esc_html_e( 'Site key', 'topezia-chat' ); ?>:
				<code><?php echo esc_html( substr( $key, 0, 6 ) . str_repeat( '•', 8 ) ); ?></code>
			</p>
		</div>

		<div class="topezia-card">
			<h3><?php esc_html_e( 'Where it shows', 'topezia-chat' ); ?></h3>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<?php wp_nonce_field( 'topezia_settings' ); ?>
				<input type="hidden" name="action" value="topezia_settings" />

				<label class="topezia-switch">
					<input type="checkbox" name="enabled" value="1" <?php checked( ! empty( $settings['enabled'] ) ); ?> />
					<span>
						<strong><?php esc_html_e( 'Show the chat on my website', 'topezia-chat' ); ?></strong>
						<em><?php esc_html_e( 'Turning this off removes the bubble without disconnecting your account.', 'topezia-chat' ); ?></em>
					</span>
				</label>

				<?php if ( class_exists( 'WooCommerce' ) ) : ?>
					<label class="topezia-switch">
						<input type="checkbox" name="skip_checkout" value="1" <?php checked( ! empty( $settings['skip_checkout'] ) ); ?> />
						<span>
							<strong><?php esc_html_e( 'Hide on cart and checkout', 'topezia-chat' ); ?></strong>
							<em><?php esc_html_e( 'Some shops want nothing over the pay button. Others find it rescues abandoned carts — your call.', 'topezia-chat' ); ?></em>
						</span>
					</label>
				<?php endif; ?>

				<?php
				$pages = get_pages( array( 'number' => 200, 'sort_column' => 'post_title' ) );
				if ( $pages ) :
					?>
					<div class="topezia-field">
						<strong><?php esc_html_e( 'Hide on these pages', 'topezia-chat' ); ?></strong>
						<div class="topezia-checklist">
							<?php foreach ( $pages as $page ) : ?>
								<label>
									<input
										type="checkbox"
										name="hide_on[]"
										value="<?php echo esc_attr( (string) $page->ID ); ?>"
										<?php checked( in_array( (int) $page->ID, array_map( 'intval', (array) $settings['hide_on'] ), true ) ); ?>
									/>
									<?php echo esc_html( $page->post_title ? $page->post_title : __( '(no title)', 'topezia-chat' ) ); ?>
								</label>
							<?php endforeach; ?>
						</div>
					</div>
				<?php endif; ?>

				<button type="submit" class="topezia-btn topezia-btn-primary"><?php esc_html_e( 'Save', 'topezia-chat' ); ?></button>
			</form>
		</div>
	</div>

	<?php if ( is_array( $status ) && ! empty( $status['plan'] ) && 'FREE' === ( $status['plan']['id'] ?? '' ) ) : ?>
		<div class="topezia-card topezia-upgrade">
			<div>
				<h3><?php esc_html_e( 'Need more than the free plan?', 'topezia-chat' ); ?></h3>
				<p class="topezia-muted">
					<?php esc_html_e( 'Paid plans read more of your site, answer far more questions, drop the Topezia line from your chat and let it wear your own colour. Leads and your inbox stay unlimited on every plan, including free.', 'topezia-chat' ); ?>
				</p>
			</div>
			<a class="topezia-btn topezia-btn-primary" href="<?php echo esc_url( $dash . '/employer/billing' ); ?>" target="_blank" rel="noopener">
				<?php esc_html_e( 'See the plans', 'topezia-chat' ); ?>
			</a>
		</div>
	<?php endif; ?>

	<div class="topezia-card topezia-danger">
		<div>
			<h3><?php esc_html_e( 'Disconnect', 'topezia-chat' ); ?></h3>
			<p class="topezia-muted">
				<?php esc_html_e( 'Removes the chat from this website and forgets the keys stored here. Your Topezia account, your leads and every conversation stay exactly where they are.', 'topezia-chat' ); ?>
			</p>
		</div>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<?php wp_nonce_field( 'topezia_disconnect' ); ?>
			<input type="hidden" name="action" value="topezia_disconnect" />
			<button type="submit" class="topezia-btn topezia-btn-danger"><?php esc_html_e( 'Disconnect this site', 'topezia-chat' ); ?></button>
		</form>
	</div>
	<?php
}

/** One KPI tile, optionally with a usage bar. */
function topezia_chat_stat( $label, $value, $note, $pct = null ) {
	?>
	<div class="topezia-stat">
		<span class="topezia-stat-label"><?php echo esc_html( $label ); ?></span>
		<span class="topezia-stat-value"><?php echo esc_html( $value ); ?></span>
		<?php if ( null !== $pct ) : ?>
			<span class="topezia-bar"><span style="width:<?php echo esc_attr( (string) (int) $pct ); ?>%"></span></span>
		<?php endif; ?>
		<span class="topezia-stat-note"><?php echo esc_html( $note ); ?></span>
	</div>
	<?php
}

/** The escape hatch, folded away — it is the rare path, not the main one. */
function topezia_chat_render_manual_box() {
	?>
	<details class="topezia-card topezia-details">
		<summary><?php esc_html_e( 'Already have a Topezia account? Paste your site key instead', 'topezia-chat' ); ?></summary>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<?php wp_nonce_field( 'topezia_manual' ); ?>
			<input type="hidden" name="action" value="topezia_manual" />
			<p class="topezia-muted">
				<?php esc_html_e( 'Find it on the Install tab of your Topezia chat settings. Connecting properly is better — it sets your site up and lets this screen show your figures — but a pasted key works.', 'topezia-chat' ); ?>
			</p>
			<input type="text" name="site_key" class="regular-text code" placeholder="<?php esc_attr_e( 'Your site key', 'topezia-chat' ); ?>" />
			<button type="submit" class="topezia-btn"><?php esc_html_e( 'Save key', 'topezia-chat' ); ?></button>
		</form>
	</details>
	<?php
}

function topezia_chat_shorten( $text, $max ) {
	$text = trim( preg_replace( '/\s+/', ' ', $text ) );
	return strlen( $text ) > $max ? substr( $text, 0, $max - 1 ) . '…' : $text;
}
