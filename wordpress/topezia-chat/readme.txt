=== Topezia Chat ===
Contributors: topezia
Tags: chat, ai chat, live chat, chatbot, leads
Requires at least: 5.8
Tested up to: 6.8
Requires PHP: 7.2
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

AI chat that answers visitors from your own website's content — and sends every real lead to your Topezia inbox for a human reply.

== Description ==

Topezia Chat puts a small chat bubble on your website. Visitors ask questions; the assistant answers **only from what's written on your own pages** — your services, your work, your about page. It cites the page an answer came from, and it never invents prices, dates, or promises: anything it can't find written down becomes a message for you instead.

Every real lead — a visitor who leaves their email — lands in your Topezia inbox with the full chat transcript attached. You reply from Topezia; your reply reaches the visitor by email with a private conversation link. The bot handles the questions, you handle the people.

**Features**

* Answers grounded in your own website content, with source links
* "Leave a message" handoff — leads arrive in your Topezia inbox with the chat transcript
* You reply from Topezia; the visitor gets your answer by email, no account needed
* If you post jobs on Topezia, hiring questions meet real, current information
* Free plan includes 200 AI answers per month — after that the chat keeps taking messages, it just stops answering automatically

**Setup takes two minutes**

The plugin itself is a single script tag with your site key — all the intelligence runs on Topezia's side, so nothing heavy runs on your WordPress.

== External services ==

This plugin embeds the Topezia chat widget, a service provided by Topezia (https://www.topezia.com). When the chat is enabled:

* Your site loads one script (https://www.topezia.com/widget.js) and an iframe from topezia.com on public pages.
* Messages a visitor types into the chat, and the email address they choose to leave, are sent to and stored by Topezia so the site owner can read and answer them.
* To make the assistant able to answer, Topezia reads (crawls) the public pages of the website domain the site owner registered — this happens from Topezia's servers, not from this plugin.

This applies only after you create a Topezia account, set up the widget there, and paste your site key into the plugin. Topezia's terms and privacy policy: https://www.topezia.com/terms and https://www.topezia.com/privacy

== Installation ==

1. On topezia.com, open your employer dashboard → Site chat, enter your website's domain and press "Scan my site". Copy the site key.
2. In WordPress, go to Plugins → Add New → Upload Plugin and upload this plugin's zip (or install it from the directory), then activate it.
3. Go to Settings → Topezia Chat and paste your site key. The bubble is live.

To turn the chat off, empty the site key here — or flip the switch on your Topezia Site chat page, which works even if you can't reach WordPress.

== Frequently Asked Questions ==

= Does the assistant make things up? =

It is instructed to answer only from what is written on your site and to say "I don't know — leave a message" for anything else, including prices and timelines that aren't published. Answers cite the page they came from.

= Where do the conversations go? =

Chats stay in the visitor's browser until they choose to leave their email. From that moment the message and transcript are stored in your Topezia inbox, and your reply goes to the visitor by email.

= Does this slow my site down? =

The plugin adds one async script tag. The chat itself lives in an iframe loaded from Topezia and doesn't touch your theme, styles, or database.

= What does it cost? =

The free plan includes 200 AI answers a month per site. When they're used up, the chat keeps collecting messages for your inbox — it never goes dark.

== Changelog ==

= 1.0.0 =
* First release: site key setting, async widget loader, external-services disclosure.
