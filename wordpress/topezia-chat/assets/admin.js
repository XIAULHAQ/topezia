/**
 * The waiting screen checks for itself.
 *
 * Someone who approves the connection in another tab should find this one
 * already finished when they switch back, rather than a page telling them to
 * press refresh. Polls every four seconds, gives up after five minutes, and
 * stops the moment the answer is anything other than "still pending" — a
 * loop with no exit is how a plugin ends up hammering a server all weekend
 * because somebody left a tab open.
 */
( function () {
	'use strict';

	var box = document.getElementById( 'topezia-waiting' );
	if ( ! box || typeof window.topeziaChat === 'undefined' ) {
		return;
	}

	var EVERY = 4000;
	var GIVE_UP_AFTER = 5 * 60 * 1000;
	var started = Date.now();
	var timer = null;

	function stop() {
		if ( timer ) {
			window.clearTimeout( timer );
			timer = null;
		}
	}

	function schedule() {
		if ( Date.now() - started > GIVE_UP_AFTER ) {
			return; // the Check now button is still there
		}
		timer = window.setTimeout( poll, EVERY );
	}

	function poll() {
		// Nothing to gain from polling a tab nobody is looking at.
		if ( document.hidden ) {
			schedule();
			return;
		}

		var body = new window.FormData();
		body.append( 'action', 'topezia_poll' );
		body.append( 'nonce', window.topeziaChat.nonce );

		window
			.fetch( window.topeziaChat.ajaxUrl, {
				method: 'POST',
				credentials: 'same-origin',
				body: body
			} )
			.then( function ( res ) {
				return res.json();
			} )
			.then( function ( json ) {
				if ( json && json.success && json.data && json.data.state === 'ready' ) {
					stop();
					window.location.reload();
					return;
				}
				// An error here is usually "not approved yet, and the row is
				// gone" — reloading shows the real message rather than
				// inventing one in JavaScript.
				if ( json && ! json.success ) {
					stop();
					window.location.reload();
					return;
				}
				schedule();
			} )
			.catch( function () {
				schedule(); // a blip, not a verdict
			} );
	}

	document.addEventListener( 'visibilitychange', function () {
		if ( ! document.hidden && ! timer ) {
			poll();
		}
	} );

	schedule();
} )();
