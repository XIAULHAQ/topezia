=== Topezia Chat — AI Chatbot & Lead Capture ===
Contributors: brandontyfusion
Tags: ai chatbot, chatbot, live chat, lead generation, woocommerce
Requires at least: 5.8
Tested up to: 7.0
Requires PHP: 7.2
Stable tag: 2.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

An AI chat bubble that answers visitors from your own pages, captures leads and emails them to you. Connect in one click.

== Description ==

Topezia Chat adds a small chat bubble to your website. Visitors ask questions; the assistant answers **from what is actually written on your own pages** — your services, your prices, your about page — and links to the page an answer came from. When it cannot find something written down, it says so and takes a message instead of inventing an answer.

Every real lead lands in your Topezia inbox and in your email, with the whole conversation attached — both sides of it, not just the form fields. You reply from Topezia and the visitor gets your answer by email, with a private link to carry on. The chat handles the questions; you handle the people.

**Connecting takes one click.** Press Connect and the plugin offers what your site already knows about itself — its name, tagline, logo, about text, contact email and, on a WooCommerce store, the shop address and currency. You confirm on topezia.com, and your account, your company profile and your website are set up from that. Nothing to copy, nothing to paste, no key to find.

= What it does =

* **Answers from your own website.** Topezia reads your public pages and answers from them, with a link to the source. No scripts to write, no FAQ to maintain.
* **Captures leads properly.** Name, email and phone typed into the chat become a lead, with the full transcript — a detail mentioned in passing at message four is not lost.
* **Emails you every one.** Straight away, with the conversation, so you can reply from your phone.
* **Speaks your visitors' language.** It replies in whatever language the question was asked in.
* **Knows your shop.** On WooCommerce it can recommend products and hand shoppers to your own checkout with the basket already filled. Order tracking is available and stays switched off until you connect the store yourself.
* **Free forever on one website.** No card. Leads and your inbox are never limited on any plan, including free — running out of AI answers must never cost you a customer.

= What it does to your site =

One asynchronous `<script>` tag on the front end, and nothing else. No styles, no shortcodes, no database tables, no work on requests that are not page views. The chat itself runs inside an iframe served by topezia.com, so what runs on your WordPress stays tiny.

You decide where it appears: everywhere, or hidden on pages you choose, or hidden on the WooCommerce cart and checkout.

= Free and paid =

The free plan covers one website with 200 AI answers a month and 60 pages read. Paid plans read more pages, answer more questions, remove the small Topezia line from the chat and let it wear your own colour. Leads, the inbox and deal tracking are free forever, on every plan.

Plans are bought on topezia.com. This plugin never asks for payment details.

== External services ==

This plugin connects to **Topezia** (https://www.topezia.com), the service that runs the chat. The plugin is a connector: without a Topezia account it does nothing.

**Nothing is sent anywhere until you press "Connect to Topezia".** There is no call on activation, no telemetry and no analytics.

When you press Connect, the plugin sends your site's public identity so your account can be set up without retyping it: your website address, site name, tagline, the text of your About page if you have one, your admin or WooCommerce contact email, your logo URL, your site language, WordPress and PHP versions, published post and page counts, and — on a WooCommerce store — the shop address, currency and product count. Every one of these is listed on screen before you press the button, and every one can be refused on the confirmation screen that follows. No posts, users, customers or orders are read at any point.

After connecting, the plugin asks Topezia for its own status (leads captured, AI answers used, pages read) to fill the dashboard. Your visitors' browsers load the chat script from topezia.com; conversations happen between your visitor and Topezia, not through your WordPress.

Terms of service: https://www.topezia.com/terms
Privacy policy: https://www.topezia.com/privacy

== Installation ==

1. Install and activate the plugin.
2. Go to **Topezia** in the admin menu.
3. Press **Connect to Topezia**, create your account or sign in, and confirm.
4. The chat bubble is live. Topezia reads your pages so it can start answering.

Already have an account? The setup screen has a "paste your site key instead" option.

== Frequently Asked Questions ==

= Do I need a Topezia account? =

Yes. The plugin is the connector; the AI, your inbox and your leads live on Topezia. Creating an account is part of pressing Connect, and the free plan needs no card.

= Does it make things up? =

It answers from your pages and cites them. When something is not written down anywhere on your site, it says so and offers to take a message rather than guessing — which is the behaviour you want when a visitor asks about a price or a deadline.

= What happens when the free AI answers run out? =

The chat keeps working and keeps taking messages and leads. It just stops answering automatically until the month rolls over. Running out is never allowed to cost you a lead.

= Will it slow my site down? =

The plugin adds one async script tag. It does not block rendering, load styles, or query the database on the front end beyond reading two options.

= Can I hide it on some pages? =

Yes — pick the pages on the plugin's settings card, or hide it on the WooCommerce cart and checkout with a single switch. Developers can use the `topezia_chat_show` filter for anything more specific.

= What happens if I deactivate or delete the plugin? =

The chat disappears from your website immediately. Your Topezia account, your leads and your conversations are untouched — deleting a plugin is not a request to destroy customer records. Deleting the plugin removes only the settings it stored in WordPress.

= Does it work with WooCommerce? =

Yes. It detects your store, can recommend products and can send a shopper to your own checkout with the basket already filled — the money is always taken by your store, never by us. Answering "where is my order?" from real order data is available and stays off until you connect the store deliberately.

== Screenshots ==

1. The chat bubble on a live website, answering from the site's own pages.
2. One-click connect — the plugin shows exactly what it will send before it sends anything.
3. The dashboard: leads captured, AI answers used, pages read, questions it missed.
4. Choosing where the chat appears.

== Changelog ==

= 2.0.0 =
* One-click connect: create your Topezia account and set up your website without copying a key.
* Your company profile is offered from what WordPress already knows — name, tagline, about text, logo, contact email, and the store address and currency on WooCommerce. Every field is refusable, and existing Topezia profile text is never overwritten.
* New dashboard inside WordPress: leads captured, AI answers used against your plan, pages read, and questions the chat could not answer.
* Choose where the chat appears — hide it on chosen pages, or on the WooCommerce cart and checkout.
* Disconnect cleanly from WordPress, leaving your account and leads intact.

= 1.0.0 =
* First release: paste your site key, chat goes live.

== Upgrade Notice ==

= 2.0.0 =
Adds one-click connect, a dashboard with your real figures, and control over where the chat appears. Existing site keys keep working — nothing to redo.
