/**
 * @copyright (c) 2011, Yahoo! Inc.  All rights reserved.
 * @copyright (c) 2012, Log-Normal, Inc.  All rights reserved.
 * @copyright (c) 2012-2016, SOASTA, Inc. All rights reserved.
 * Copyrights licensed under the BSD License. See the accompanying LICENSE.txt file for terms.
 */

/**
 * @namespace Boomerang
 * @desc
 * boomerang measures various performance characteristics of your user's browsing
 * experience and beacons it back to your server.
 *
 * To use this you'll need a web site, lots of users and the ability to do
 * something with the data you collect.  How you collect the data is up to
 * you, but we have a few ideas.
*/

/**
 * @memberof Boomerang
 * @type {TimeStamp}
 * @desc
 * Measure the time the script started
 * This has to be global so that we don't wait for the entire
 * BOOMR function to download and execute before measuring the
 * time.  We also declare it without `var` so that we can later
 * `delete` it.  This is the only way that works on Internet Explorer
*/
BOOMR_start = new Date().getTime();

/**
 * @function
 * @desc
 * Check the value of document.domain and fix it if incorrect.
 * This function is run at the top of boomerang, and then whenever
 * init() is called.  If boomerang is running within an iframe, this
 * function checks to see if it can access elements in the parent
 * iframe.  If not, it will fudge around with document.domain until
 * it finds a value that works.
 *
 * This allows site owners to change the value of document.domain at
 * any point within their page's load process, and we will adapt to
 * it.
 * @param {string} domain - domain name as retrieved from page url
 */
function BOOMR_check_doc_domain(domain) {
	/*eslint no-unused-vars:0*/
	var test;

	if (!window) {
		return;
	}

	// If domain is not passed in, then this is a global call
	// domain is only passed in if we call ourselves, so we
	// skip the frame check at that point
	if (!domain) {
		// If we're running in the main window, then we don't need this
		if (window.parent === window || !document.getElementById("boomr-if-as")) {
			return;// true;	// nothing to do
		}

		if (window.BOOMR && BOOMR.boomerang_frame && BOOMR.window) {
			try {
				// If document.domain is changed during page load (from www.blah.com to blah.com, for example),
				// BOOMR.window.location.href throws "Permission Denied" in IE.
				// Resetting the inner domain to match the outer makes location accessible once again
				if (BOOMR.boomerang_frame.document.domain !== BOOMR.window.document.domain) {
					BOOMR.boomerang_frame.document.domain = BOOMR.window.document.domain;
				}
			}
			catch (err) {
				if (!BOOMR.isCrossOriginError(err)) {
					BOOMR.addError(err, "BOOMR_check_doc_domain.domainFix");
				}
			}
		}
		domain = document.domain;
	}

	if (domain.indexOf(".") === -1) {
		return;// false;	// not okay, but we did our best
	}

	// 1. Test without setting document.domain
	try {
		test = window.parent.document;
		return;// test !== undefined;	// all okay
	}
	// 2. Test with document.domain
	catch (err) {
		document.domain = domain;
	}
	try {
		test = window.parent.document;
		return;// test !== undefined;	// all okay
	}
	// 3. Strip off leading part and try again
	catch (err) {
		domain = domain.replace(/^[\w\-]+\./, "");
	}

	BOOMR_check_doc_domain(domain);
}

BOOMR_check_doc_domain();


// beaconing section
// the parameter is the window
(function(w) {

	var impl, boomr, d, myurl, createCustomEvent, dispatchEvent, visibilityState, visibilityChange, orig_w = w;

	// This is the only block where we use document without the w. qualifier
	if (w.parent !== w
			&& document.getElementById("boomr-if-as")
			&& document.getElementById("boomr-if-as").nodeName.toLowerCase() === "script") {
		w = w.parent;
		myurl = document.getElementById("boomr-if-as").src;
	}

	d = w.document;

	// Short namespace because I don't want to keep typing BOOMERANG
	if (!w.BOOMR) { w.BOOMR = {}; }
	BOOMR = w.BOOMR;
	// don't allow this code to be included twice
	if (BOOMR.version) {
		return;
	}

	BOOMR.version = "1.0.1491585349";
	BOOMR.window = w;
	BOOMR.boomerang_frame = orig_w;

	if (!BOOMR.plugins) { BOOMR.plugins = {}; }

	// CustomEvent proxy for IE9 & 10 from https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent
	(function() {
		try {
			if (new w.CustomEvent("CustomEvent") !== undefined) {
				createCustomEvent = function(e_name, params) {
					return new w.CustomEvent(e_name, params);
				};
			}
		}
		catch (ignore) {
			// empty
		}

		try {
			if (!createCustomEvent && d.createEvent && d.createEvent( "CustomEvent" )) {
				createCustomEvent = function(e_name, params) {
					var evt = d.createEvent( "CustomEvent" );
					params = params || { cancelable: false, bubbles: false };
					evt.initCustomEvent( e_name, params.bubbles, params.cancelable, params.detail );

					return evt;
				};
			}
		}
		catch (ignore) {
			// empty
		}

		if (!createCustomEvent && d.createEventObject) {
			createCustomEvent = function(e_name, params) {
				var evt = d.createEventObject();
				evt.type = evt.propertyName = e_name;
				evt.detail = params.detail;

				return evt;
			};
		}

		if (!createCustomEvent) {
			createCustomEvent = function() { return undefined; };
		}
	}());

	/**
	 dispatch a custom event to the browser
	 @param e_name	The custom event name that consumers can subscribe to
	 @param e_data	Any data passed to subscribers of the custom event via the `event.detail` property
	 @param async	By default, custom events are dispatched immediately.
			Set to true if the event should be dispatched once the browser has finished its current
			JavaScript execution.
	 */
	dispatchEvent = function(e_name, e_data, async) {
		var ev = createCustomEvent(e_name, {"detail": e_data});
		if (!ev) {
			return;
		}

		function dispatch() {
			if (d.dispatchEvent) {
				d.dispatchEvent(ev);
			}
			else if (d.fireEvent) {
				d.fireEvent("onpropertychange", ev);
			}
		}

		if (async) {
			BOOMR.setImmediate(dispatch);
		}
		else {
			dispatch();
		}
	};

	// visibilitychange is useful to detect if the page loaded through prerender
	// or if the page never became visible
	// http://www.w3.org/TR/2011/WD-page-visibility-20110602/
	// http://www.nczonline.net/blog/2011/08/09/introduction-to-the-page-visibility-api/
	// https://developer.mozilla.org/en-US/docs/Web/Guide/User_experience/Using_the_Page_Visibility_API

	// Set the name of the hidden property and the change event for visibility
	if (typeof document.hidden !== "undefined") { // Opera 12.10 and Firefox 18 and later support
		visibilityState = "visibilityState";
		visibilityChange = "visibilitychange";
	}
	else if (typeof document.mozHidden !== "undefined") {
		visibilityState = "mozVisibilityState";
		visibilityChange = "mozvisibilitychange";
	}
	else if (typeof document.msHidden !== "undefined") {
		visibilityState = "msVisibilityState";
		visibilityChange = "msvisibilitychange";
	}
	else if (typeof document.webkitHidden !== "undefined") {
		visibilityState = "webkitVisibilityState";
		visibilityChange = "webkitvisibilitychange";
	}

	// impl is a private object not reachable from outside the BOOMR object
	// users can set properties by passing in to the init() method
	impl = {
		// properties
		beacon_url: "",
		// beacon request method, either GET, POST or AUTO. AUTO will check the
		// request size then use GET if the request URL is less than MAX_GET_LENGTH chars
		// otherwise it will fall back to a POST request.
		//beacon_type: "AUTO", Always POST
		//  beacon authorization key value.  Most systems will use the 'Authentication' keyword, but some
		//  some services use keys like 'X-Auth-Token' or other custom keys
		beacon_auth_key: "Authorization",
		//  beacon authorization token.  This is only needed if your are using a POST and
		//  the beacon requires an Authorization token to accept your data
		beacon_auth_token: undefined,
		// strip out everything except last two parts of hostname.
		// This doesn't work well for domains that end with a country tld,
		// but we allow the developer to override site_domain for that.
		// You can disable all cookies by setting site_domain to a falsy value
		site_domain: w.location.hostname.
					replace(/.*?([^.]+\.[^.]+)\.?$/, "$1").
					toLowerCase(),
		//! User's ip address determined on the server.  Used for the BA cookie
		user_ip: "",
		// Whether or not to send beacons on page load
		autorun: true,

		//! strip_query_string: false,

		//! onloadfired: false,

		//! handlers_attached: false,
		events: {
			"page_ready": [],
			"page_unload": [],
			"before_unload": [],
			"dom_loaded": [],
			"visibility_changed": [],
			"prerender_to_visible": [],
			"before_beacon": [],
			"onbeacon": [],
			"xhr_load": [],
			"click": [],
			"form_submit": []
		},

		public_events: {
			"before_beacon": "onBeforeBoomerangBeacon",
			"onbeacon": "onBoomerangBeacon",
			"onboomerangloaded": "onBoomerangLoaded"
		},

		vars: {},

		errors: {},

		disabled_plugins: {},

		xb_handler: function(type) {
			return function(ev) {
				var target;
				if (!ev) { ev = w.event; }
				if (ev.target) { target = ev.target; }
				else if (ev.srcElement) { target = ev.srcElement; }
				if (target.nodeType === 3) {// defeat Safari bug
					target = target.parentNode;
				}

				// don't capture events on flash objects
				// because of context slowdowns in PepperFlash
				if (target && target.nodeName.toUpperCase() === "OBJECT" && target.type === "application/x-shockwave-flash") {
					return;
				}
				impl.fireEvent(type, target);
			};
		},

		fireEvent: function(e_name, data) {
			var i, handler, handlers;

			e_name = e_name.toLowerCase();

			if (!this.events.hasOwnProperty(e_name)) {
				return;// false;
			}

			if (this.public_events.hasOwnProperty(e_name)) {
				dispatchEvent(this.public_events[e_name], data);
			}

			handlers = this.events[e_name];

			// Before we fire any event listeners, let's call real_sendBeacon() to flush
			// any beacon that is being held by the setImmediate.
			if (e_name !== "before_beacon" && e_name !== "onbeacon") {
				BOOMR.real_sendBeacon();
			}

			for (i = 0; i < handlers.length; i++) {
				try {
					handler = handlers[i];
					handler.fn.call(handler.scope, data, handler.cb_data);
				}
				catch (err) {
					BOOMR.addError(err, "fireEvent." + e_name + "<" + i + ">");
				}
			}

			return;// true;
		}
	};

	// We create a boomr object and then copy all its properties to BOOMR so that
	// we don't overwrite anything additional that was added to BOOMR before this
	// was called... for example, a plugin.
	boomr = {
		//! t_lstart: value of BOOMR_lstart set in host page
		t_start: BOOMR_start,
		//! t_end: value set in zzz-last-plugin.js

		url: myurl,

		// constants visible to the world
		constants: {
			// SPA beacon types
			BEACON_TYPE_SPAS: ["spa", "spa_hard"],
			// using 2000 here as a de facto maximum URL length based on:
			// http://stackoverflow.com/questions/417142/what-is-the-maximum-length-of-a-url-in-different-browsers
			MAX_GET_LENGTH: 2000
		},

		// Utility functions
		utils: {
			objectToString: function(o, separator, nest_level) {
				var value = [], k;

				if (!o || typeof o !== "object") {
					return o;
				}
				if (separator === undefined) {
					separator = "\n\t";
				}
				if (!nest_level) {
					nest_level = 0;
				}

				if (Object.prototype.toString.call(o) === "[object Array]") {
					for (k = 0; k < o.length; k++) {
						if (nest_level > 0 && o[k] !== null && typeof o[k] === "object") {
							value.push(
								this.objectToString(
									o[k],
									separator + (separator === "\n\t" ? "\t" : ""),
									nest_level - 1
								)
							);
						}
						else {
							if (separator === "&") {
								value.push(encodeURIComponent(o[k]));
							}
							else {
								value.push(o[k]);
							}
						}
					}
					separator = ",";
				}
				else {
					for (k in o) {
						if (Object.prototype.hasOwnProperty.call(o, k)) {
							if (nest_level > 0 && o[k] !== null && typeof o[k] === "object") {
								value.push(encodeURIComponent(k) + "=" +
									this.objectToString(
										o[k],
										separator + (separator === "\n\t" ? "\t" : ""),
										nest_level - 1
									)
								);
							}
							else {
								if (separator === "&") {
									value.push(encodeURIComponent(k) + "=" + encodeURIComponent(o[k]));
								}
								else {
									value.push(k + "=" + o[k]);
								}
							}
						}
					}
				}

				return value.join(separator);
			},

			getCookie: function(name) {
				if (!name) {
					return null;
				}

				name = " " + name + "=";

				var i, cookies;
				cookies = " " + d.cookie + ";";
				if ( (i = cookies.indexOf(name)) >= 0 ) {
					i += name.length;
					cookies = cookies.substring(i, cookies.indexOf(";", i)).replace(/^"/, "").replace(/"$/, "");
					return cookies;
				}
			},

			setCookie: function(name, subcookies, max_age) {
				var value, nameval, savedval, c, exp;

				if (!name || !impl.site_domain) {
					BOOMR.debug("No cookie name or site domain: " + name + "/" + impl.site_domain);
					return false;
				}

				value = this.objectToString(subcookies, "&");
				nameval = name + "=\"" + value + "\"";

				c = [nameval, "path=/", "domain=" + impl.site_domain];
				if (max_age) {
					exp = new Date();
					exp.setTime(exp.getTime() + max_age * 1000);
					exp = exp.toGMTString();
					c.push("expires=" + exp);
				}

				if ( nameval.length < 500 ) {
					d.cookie = c.join("; ");
					// confirm cookie was set (could be blocked by user's settings, etc.)
					savedval = this.getCookie(name);
					if (value === savedval) {
						return true;
					}
					BOOMR.warn("Saved cookie value doesn't match what we tried to set:\n" + value + "\n" + savedval);
				}
				else {
					BOOMR.warn("Cookie too long: " + nameval.length + " " + nameval);
				}

				return false;
			},

			getSubCookies: function(cookie) {
				var cookies_a,
				    i, l, kv,
				    gotcookies = false,
				    cookies = {};

				if (!cookie) {
					return null;
				}

				if (typeof cookie !== "string") {
					BOOMR.debug("TypeError: cookie is not a string: " + typeof cookie);
					return null;
				}

				cookies_a = cookie.split("&");

				for (i = 0, l = cookies_a.length; i < l; i++) {
					kv = cookies_a[i].split("=");
					if (kv[0]) {
						kv.push("");	// just in case there's no value
						cookies[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
						gotcookies = true;
					}
				}

				return gotcookies ? cookies : null;
			},

			removeCookie: function(name) {
				return this.setCookie(name, {}, -86400);
			},

			/**
			 * Cleans up a URL by removing the query string (if configured), and
			 * limits the URL to the specified size.
			 *
			 * @param {string} url URL to clean
			 * @param {number} urlLimit Maximum size, in characters, of the URL
			 *
			 * @returns {string} Cleaned up URL
			 */
			cleanupURL: function(url, urlLimit) {
				if (!url || Object.prototype.toString.call(url) === "[object Array]") {
					return "";
				}

				if (impl.strip_query_string) {
					url = url.replace(/\?.*/, "?qs-redacted");
				}

				if (typeof urlLimit !== "undefined" && url && url.length > urlLimit) {
					// We need to break this URL up.  Try at the query string first.
					var qsStart = url.indexOf("?");
					if (qsStart !== -1 && qsStart < urlLimit) {
						url = url.substr(0, qsStart) + "?...";
					}
					else {
						// No query string, just stop at the limit
						url = url.substr(0, urlLimit - 3) + "...";
					}
				}

				return url;
			},

			hashQueryString: function(url, stripHash) {
				if (!url) {
					return url;
				}
				if (!url.match) {
					BOOMR.addError("TypeError: Not a string", "hashQueryString", typeof url);
					return "";
				}
				if (url.match(/^\/\//)) {
					url = location.protocol + url;
				}
				if (!url.match(/^(https?|file):/)) {
					BOOMR.error("Passed in URL is invalid: " + url);
					return "";
				}
				if (stripHash) {
					url = url.replace(/#.*/, "");
				}
				if (!BOOMR.utils.MD5) {
					return url;
				}
				return url.replace(/\?([^#]*)/, function(m0, m1) { return "?" + (m1.length > 10 ? BOOMR.utils.MD5(m1) : m1); });
			},

			pluginConfig: function(o, config, plugin_name, properties) {
				var i, props = 0;

				if (!config || !config[plugin_name]) {
					return false;
				}

				for (i = 0; i < properties.length; i++) {
					if (config[plugin_name][properties[i]] !== undefined) {
						o[properties[i]] = config[plugin_name][properties[i]];
						props++;
					}
				}

				return (props > 0);
			},
			/**
			 * `filter` for arrays
			 *
			 * @private
			 * @param {Array} array The array to iterate over.
			 * @param {Function} predicate The function invoked per iteration.
			 * @returns {Array} Returns the new filtered array.
			 */
			arrayFilter: function(array, predicate) {
				var result = [];

				if (typeof array.filter === "function") {
					result = array.filter(predicate);
				}
				else {
					var index = -1,
					    length = array.length,
					    value;

					while (++index < length) {
						value = array[index];
						if (predicate(value, index, array)) {
							result[result.length] = value;
						}
					}
				}
				return result;
			},
			/**
			 * @desc
			 * Add a MutationObserver for a given element and terminate after `timeout`ms.
			 * @param el		DOM element to watch for mutations
			 * @param config		MutationObserverInit object (https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver#MutationObserverInit)
			 * @param timeout		Number of milliseconds of no mutations after which the observer should be automatically disconnected
			 * 			If set to a falsy value, the observer will wait indefinitely for Mutations.
			 * @param callback	Callback function to call either on timeout or if mutations are detected.  The signature of this method is:
			 * 				function(mutations, callback_data)
			 * 			Where:
			 * 				mutations is the list of mutations detected by the observer or `undefined` if the observer timed out
			 * 				callback_data is the passed in `callback_data` parameter without modifications
			 *
			 * 						The callback function may return a falsy value to disconnect the observer after it returns, or a truthy value to
			 * 			keep watching for mutations. If the return value is numeric and greater than 0, then this will be the new timeout
			 * 			if it is boolean instead, then the timeout will not fire any more so the caller MUST call disconnect() at some point
			 * @param callback_data	Any data to be passed to the callback function as its second parameter
			 * @param callback_ctx	An object that represents the `this` object of the `callback` method.  Leave unset the callback function is not a method of an object
			 *
			 * @returns {?object} - `null` if a MutationObserver could not be created OR
			 * 		- An object containing the observer and the timer object:
			 * 		  { observer: <MutationObserver>, timer: <Timeout Timer if any> }
			 *
			 * 		The caller can use this to disconnect the observer at any point by calling `retval.observer.disconnect()`
			 * 		Note that the caller should first check to see if `retval.observer` is set before calling `disconnect()` as it may
			 * 		have been cleared automatically.
			 */
			addObserver: function(el, config, timeout, callback, callback_data, callback_ctx) {
				var o = {observer: null, timer: null};

				if (!window.MutationObserver || !callback || !el) {
					return null;
				}

				function done(mutations) {
					var run_again = false;

					if (o.timer) {
						clearTimeout(o.timer);
						o.timer = null;
					}

					if (callback) {
						run_again = callback.call(callback_ctx, mutations, callback_data);

						if (!run_again) {
							callback = null;
						}
					}

					if (!run_again && o.observer) {
						o.observer.disconnect();
						o.observer = null;
					}

					if (typeof run_again === "number" && run_again > 0) {
						o.timer = setTimeout(done, run_again);
					}
				}

				o.observer = new MutationObserver(done);

				if (timeout) {
					o.timer = setTimeout(done, o.timeout);
				}

				o.observer.observe(el, config);

				return o;
			},

			addListener: function(el, type, fn) {
				if (el.addEventListener) {
					el.addEventListener(type, fn, false);
				}
				else if (el.attachEvent) {
					el.attachEvent( "on" + type, fn );
				}
			},

			removeListener: function(el, type, fn) {
				if (el.removeEventListener) {
					el.removeEventListener(type, fn, false);
				}
				else if (el.detachEvent) {
					el.detachEvent("on" + type, fn);
				}
			},

			pushVars: function(form, vars, prefix) {
				var k, i, l = 0, input;

				if (window.JSON) {
					//send the whole beacon data as a POST json request
					form.innerHTML = "";
					input  = document.createElement("input");
					input.name = "data";
					input.value = JSON.stringify(impl.vars);
					form.appendChild(input);
					l = input.value.length;
				} else {

					for (k in vars) {
						if (vars.hasOwnProperty(k)) {
							if (Object.prototype.toString.call(vars[k]) === "[object Array]") {
								for (i = 0; i < vars[k].length; ++i) {
									l += BOOMR.utils.pushVars(form, vars[k][i], k + "[" + i + "]");
								}
							}
							else {
								input = document.createElement("input");
								input.type = "hidden";	// we need `hidden` to preserve newlines. see commit message for more details
								input.name = (prefix ? (prefix + "[" + k + "]") : k);
								input.value = (vars[k] === undefined || vars[k] === null ? "" : vars[k]);

								form.appendChild(input);

								l += encodeURIComponent(input.name).length + encodeURIComponent(input.value).length + 2;
							}
						}
					}
				}

				return l;
			},

			inArray: function(val, ary) {
				var i;

				if (typeof val === "undefined" || typeof ary === "undefined" || !ary.length) {
					return false;
				}

				for (i = 0; i < ary.length; i++) {
					if (ary[i] === val) {
						return true;
					}
				}

				return false;
			},

			/**
			 * Get a query parameter value from a URL's query string
			 *
			 * @param {string} param Query parameter name
			 * @param {string|Object} [url] URL containing the query string, or a link object. Defaults to BOOMR.window.location
			 *
			 * @returns {string|null} URI decoded value or null if param isn't a query parameter
			 */
			getQueryParamValue: function(param, url) {
				var l, params, i, kv;
				if (!param) {
					return null;
				}

				if (typeof url === "string") {
					l = BOOMR.window.document.createElement("a");
					l.href = url;
				}
				else if (typeof url === "object" && typeof url.search === "string") {
					l = url;
				}
				else {
					l = BOOMR.window.location;
				}

				// Now that we match, pull out all query string parameters
				params = l.search.slice(1).split(/&/);

				for (i = 0; i < params.length; i++) {
					if (params[i]) {
						kv = params[i].split("=");
						if (kv.length && kv[0] === param) {
							return decodeURIComponent(kv[1].replace(/\+/g, " "));
						}
					}
				}
				return null;
			}
		},

		init: function(config) {
			var i, k,
			    properties = [
				    "beacon_url",
				    "beacon_type",
				    "beacon_auth_key",
				    "beacon_auth_token",
				    "site_domain",
				    "user_ip",
				    "strip_query_string",
				    "secondary_beacons",
				    "autorun"
			    ];

			BOOMR_check_doc_domain();

			if (!config) {
				config = {};
			}

			if (config.primary && impl.handlers_attached) {
				return this;
			}

			if (config.log !== undefined) {
				this.log = config.log;
			}
			if (!this.log) {
				this.log = function(/* m,l,s */) {};
			}

			// Set autorun if in config right now, as plugins that listen for page_ready
			// event may fire when they .init() if onload has already fired, and whether
			// or not we should fire page_ready depends on config.autorun.
			if (typeof config.autorun !== "undefined") {
				impl.autorun = config.autorun;
			}

			for (k in this.plugins) {
				if (this.plugins.hasOwnProperty(k)) {
					// config[plugin].enabled has been set to false
					if ( config[k]
						&& config[k].hasOwnProperty("enabled")
						&& config[k].enabled === false
					) {
						impl.disabled_plugins[k] = 1;

						if (typeof this.plugins[k].disable === "function") {
							this.plugins[k].disable();
						}

						continue;
					}

					// plugin was previously disabled
					if (impl.disabled_plugins[k]) {

						// and has not been explicitly re-enabled
						if ( !config[k]
							|| !config[k].hasOwnProperty("enabled")
							|| config[k].enabled !== true
						) {
							continue;
						}

						if (typeof this.plugins[k].enable === "function") {
							this.plugins[k].enable();
						}

						// plugin is now enabled
						delete impl.disabled_plugins[k];
					}

					// plugin exists and has an init method
					if (typeof this.plugins[k].init === "function") {
						try {
							this.plugins[k].init(config);
						}
						catch (err) {
							BOOMR.addError(err, k + ".init");
						}
					}
				}
			}

			for (i = 0; i < properties.length; i++) {
				if (config[properties[i]] !== undefined) {
					impl[properties[i]] = config[properties[i]];
				}
			}

			if (impl.handlers_attached) {
				return this;
			}

			// The developer can override onload by setting autorun to false
			if (!impl.onloadfired && (config.autorun === undefined || config.autorun !== false)) {
				if (d.readyState && d.readyState === "complete") {
					BOOMR.loadedLate = true;
					this.setImmediate(BOOMR.page_ready_autorun, null, null, BOOMR);
				}
				else {
					if (w.onpagehide || w.onpagehide === null) {
						BOOMR.utils.addListener(w, "pageshow", BOOMR.page_ready_autorun);
					}
					else {
						BOOMR.utils.addListener(w, "load", BOOMR.page_ready_autorun);
					}
				}
			}

			BOOMR.utils.addListener(w, "DOMContentLoaded", function() { impl.fireEvent("dom_loaded"); });

			(function() {
				var forms, iterator;
				if (visibilityChange !== undefined) {
					BOOMR.utils.addListener(d, visibilityChange, function() { impl.fireEvent("visibility_changed"); });

					// save the current visibility state
					impl.lastVisibilityState = BOOMR.visibilityState();

					BOOMR.subscribe("visibility_changed", function() {
						var visState = BOOMR.visibilityState();

						// record the last time each visibility state occurred
						BOOMR.lastVisibilityEvent[visState] = BOOMR.now();

						// if we transitioned from prerender to hidden or visible, fire the prerender_to_visible event
						if (impl.lastVisibilityState === "prerender"
						    && visState !== "prerender") {
							// note that we transitioned from prerender on the beacon for debugging
							BOOMR.addVar("vis.pre", "1");

							// let all listeners know
							impl.fireEvent("prerender_to_visible");
						}

						impl.lastVisibilityState = visState;
					});
				}

				BOOMR.utils.addListener(d, "mouseup", impl.xb_handler("click"));

				forms = d.getElementsByTagName("form");
				for (iterator = 0; iterator < forms.length; iterator++) {
					BOOMR.utils.addListener(forms[iterator], "submit", impl.xb_handler("form_submit"));
				}

				if (!w.onpagehide && w.onpagehide !== null) {
					// This must be the last one to fire
					// We only clear w on browsers that don't support onpagehide because
					// those that do are new enough to not have memory leak problems of
					// some older browsers
					BOOMR.utils.addListener(w, "unload", function() { BOOMR.window = w = null; });
				}
			}());

			impl.handlers_attached = true;
			return this;
		},

		/**
		 * Sends the page_ready beacon only if 'autorun' is still true after init
		 * is called.
		 */
		page_ready_autorun: function(ev) {
			if (impl.autorun) {
				BOOMR.page_ready(ev);
			}
		},

		// The page dev calls this method when they determine the page is usable.
		// Only call this if autorun is explicitly set to false
		page_ready: function(ev) {
			if (!ev) { ev = w.event; }
			if (!ev) { ev = { name: "load" }; }
			if (impl.onloadfired) {
				return this;
			}
			impl.fireEvent("page_ready", ev);
			impl.onloadfired = true;
			return this;
		},

		setImmediate: function(fn, data, cb_data, cb_scope) {
			var cb, cstack;

			// DEBUG: This is to help debugging, we'll see where setImmediate calls were made from
			if (typeof Error !== "undefined") {
				cstack = new Error();
				cstack = cstack.stack ? cstack.stack.replace(/^Error/, "Called") : undefined;
			}
			// END-DEBUG

			cb = function() {
				fn.call(cb_scope || null, data, cb_data || {}, cstack);
				cb = null;
			};

			if (w.setImmediate) {
				w.setImmediate(cb);
			}
			else if (w.msSetImmediate) {
				w.msSetImmediate(cb);
			}
			else if (w.webkitSetImmediate) {
				w.webkitSetImmediate(cb);
			}
			else if (w.mozSetImmediate) {
				w.mozSetImmediate(cb);
			}
			else {
				setTimeout(cb, 10);
			}
		},

		now: (function() {
			try {
				var p = BOOMR.getPerformance();
				if (p && typeof p.now === "function") {
					return function() {
						return Math.round(p.now() + p.timing.navigationStart);
					};
				}
			}
			catch (ignore) {
				// empty
			}

			return Date.now || function() { return new Date().getTime(); };
		}()),

		getPerformance: function() {
			try {
				if (BOOMR.window) {
					if ("performance" in BOOMR.window && BOOMR.window.performance) {
						return BOOMR.window.performance;
					}

					// vendor-prefixed fallbacks
					return BOOMR.window.msPerformance || BOOMR.window.webkitPerformance || BOOMR.window.mozPerformance;
				}
			}
			catch (ignore) {
				// empty
			}
		},

		visibilityState: ( visibilityState === undefined ? function() { return "visible"; } : function() { return d[visibilityState]; } ),

		lastVisibilityEvent: {},

		/**
		 * Registers an event
		 *
		 * @param {string} e_name Event name
		 *
		 * @returns {BOOMR} Boomerang object
		 */
		registerEvent: function(e_name) {
			if (impl.events.hasOwnProperty(e_name)) {
				// already registered
				return this;
			}

			// create a new queue of handlers
			impl.events[e_name] = [];

			return this;
		},

		/**
		 * Fires an event
		 *
		 * @param {string} e_name Event name
		 * @param {object} data Event payload
		 *
		 * @returns {BOOMR} Boomerang object
		 */
		fireEvent: function(e_name, data) {
			return impl.fireEvent(e_name, data);
		},

		subscribe: function(e_name, fn, cb_data, cb_scope) {
			var i, handler, ev;

			e_name = e_name.toLowerCase();

			if (!impl.events.hasOwnProperty(e_name)) {
				// allow subscriptions before they're registered
				impl.events[e_name] = [];
			}

			ev = impl.events[e_name];

			// don't allow a handler to be attached more than once to the same event
			for (i = 0; i < ev.length; i++) {
				handler = ev[i];
				if (handler && handler.fn === fn && handler.cb_data === cb_data && handler.scope === cb_scope) {
					return this;
				}
			}
			ev.push({ "fn": fn, "cb_data": cb_data || {}, "scope": cb_scope || null });

			// attaching to page_ready after onload fires, so call soon
			if (e_name === "page_ready" && impl.onloadfired && impl.autorun) {
				this.setImmediate(fn, null, cb_data, cb_scope);
			}

			// Attach unload handlers directly to the window.onunload and
			// window.onbeforeunload events. The first of the two to fire will clear
			// fn so that the second doesn't fire. We do this because technically
			// onbeforeunload is the right event to fire, but all browsers don't
			// support it.  This allows us to fall back to onunload when onbeforeunload
			// isn't implemented
			if (e_name === "page_unload" || e_name === "before_unload") {
				(function() {
					var unload_handler, evt_idx = ev.length;

					unload_handler = function(evt) {
						if (fn) {
							fn.call(cb_scope, evt || w.event, cb_data);
						}

						// If this was the last unload handler, we'll try to send the beacon immediately after it is done
						// The beacon will only be sent if one of the handlers has queued it
						if (e_name === "page_unload" && evt_idx === impl.events[e_name].length) {
							BOOMR.real_sendBeacon();
						}
					};

					if (e_name === "page_unload") {
						// pagehide is for iOS devices
						// see http://www.webkit.org/blog/516/webkit-page-cache-ii-the-unload-event/
						if (w.onpagehide || w.onpagehide === null) {
							BOOMR.utils.addListener(w, "pagehide", unload_handler);
						}
						else {
							BOOMR.utils.addListener(w, "unload", unload_handler);
						}
					}
					BOOMR.utils.addListener(w, "beforeunload", unload_handler);
				}());
			}

			return this;
		},

		addError: function BOOMR_addError(err, src, extra) {
			var str, E = BOOMR.plugins.Errors;

			//
			// Use the Errors plugin if it's enabled
			//
			if (E && E.is_supported()) {
				if (typeof err === "string") {
					E.send({
						message: err,
						extra: extra,
						functionName: src,
						noStack: true
					}, E.VIA_APP, E.SOURCE_BOOMERANG);
				}
				else {
					if (typeof src === "string") {
						err.functionName = src;
					}

					if (typeof extra !== "undefined") {
						err.extra = extra;
					}

					E.send(err, E.VIA_APP, E.SOURCE_BOOMERANG);
				}

				return;
			}

			if (typeof err !== "string") {
				str = String(err);
				if (str.match(/^\[object/)) {
					str = err.name + ": " + (err.description || err.message).replace(/\r\n$/, "");
				}
				err = str;
			}
			if (src !== undefined) {
				err = "[" + src + ":" + BOOMR.now() + "] " + err;
			}
			if (extra) {
				err += ":: " + extra;
			}

			if (impl.errors[err]) {
				impl.errors[err]++;
			}
			else {
				impl.errors[err] = 1;
			}
		},

		isCrossOriginError: function(err) {
			// These are expected for cross-origin iframe access, although the Internet Explorer check will only
			// work for browsers using English.
			return err.name === "SecurityError" ||
				(err.name === "TypeError" && err.message === "Permission denied") ||
				(err.name === "Error" && err.message && err.message.match(/^(Permission|Access is) denied/));
		},

		addVar: function(name, value) {
			if (typeof name === "string") {
				impl.vars[name] = value;
			}
			else if (typeof name === "object") {
				var o = name, k;
				for (k in o) {
					if (o.hasOwnProperty(k)) {
						impl.vars[k] = o[k];
					}
				}
			}
			return this;
		},

		removeVar: function(arg0) {
			var i, params;
			if (!arguments.length) {
				return this;
			}

			if (arguments.length === 1
					&& Object.prototype.toString.apply(arg0) === "[object Array]") {
				params = arg0;
			}
			else {
				params = arguments;
			}

			for (i = 0; i < params.length; i++) {
				if (impl.vars.hasOwnProperty(params[i])) {
					delete impl.vars[params[i]];
				}
			}

			return this;
		},

		hasVar: function(name) {
			return impl.vars.hasOwnProperty(name);
		},

		requestStart: function(name) {
			var t_start = BOOMR.now();
			BOOMR.plugins.RT.startTimer("xhr_" + name, t_start);

			return {
				loaded: function(data) {
					BOOMR.responseEnd(name, t_start, data);
				}
			};
		},

		/**
		 * Determines is Boomerang can send a beacon.
		 *
		 * Queryies all plugins to see if they implement readyToSend(),
		 * and if so, that they return true;
		 *
		 * If not, the beacon cannot be sent.
		 *
		 * @returns {boolean} True if Boomerang can send a beacon
		 */
		readyToSend: function() {
			var plugin;

			for (plugin in this.plugins) {
				if (this.plugins.hasOwnProperty(plugin)) {
					if (impl.disabled_plugins[plugin]) {
						continue;
					}

					if (typeof this.plugins[plugin].readyToSend === "function"
					    && this.plugins[plugin].readyToSend() === false) {
						BOOMR.debug("Plugin " + plugin + " is not ready to send");
						return false;
					}
				}
			}

			return true;
		},

		responseEnd: function(name, t_start, data) {
			if (BOOMR.readyToSend()) {
				if (typeof name === "object" && name.url) {
					impl.fireEvent("xhr_load", name);
				}
				else {
					// flush out any queue'd beacons before we set the Page Group
					// and timers
					BOOMR.real_sendBeacon();

					BOOMR.addVar("xhr.pg", name);
					BOOMR.plugins.RT.startTimer("xhr_" + name, t_start);
					impl.fireEvent("xhr_load", {
						"name": "xhr_" + name,
						"data": data
					});
				}
			}
			// Only add to the QT variable for named Page Groups, not resources
			// with a .url
			else if (typeof name !== "object") {
				var timer = name + "|" + (BOOMR.now() - t_start);
				if (impl.vars.qt) {
					impl.vars.qt += "," + timer;
				}
				else {
					impl.vars.qt = timer;
				}
			}
			else {
				BOOMR.debug("Attempt to send a resource before a security token");
			}
		},

		//
		// uninstrumentXHR and instrumentXHR are stubs that will be replaced
		// by auto-xhr.js if active.
		//
		/**
		 * Undo XMLHttpRequest instrumentation and reset the original
		 */
		uninstrumentXHR: function() {
		},
		/**
		 * Instrument all requests made via XMLHttpRequest to send beacons
		 * This is implemented in plugins/auto-xhr.js
		 */
		instrumentXHR: function() { },

		sendBeacon: function(beacon_url_override) {
			// This plugin wants the beacon to go somewhere else,
			// so update the location
			if (beacon_url_override) {
				impl.beacon_url_override = beacon_url_override;
			}

			if (!impl.beaconQueued) {
				impl.beaconQueued = true;
				BOOMR.setImmediate(BOOMR.real_sendBeacon, null, null, BOOMR);
			}

			return true;
		},

		real_sendBeacon: function() {
			var k, form, url, errors = [], length, 
			    varsSent = {}, varsToSend = {};

			if (!impl.beaconQueued) {
				return false;
			}

			impl.beaconQueued = false;

			BOOMR.debug("Checking if we can send beacon");

			// At this point someone is ready to send the beacon.  We send
			// the beacon only if all plugins have finished doing what they
			// wanted to do
			for (k in this.plugins) {
				if (this.plugins.hasOwnProperty(k)) {
					if (impl.disabled_plugins[k]) {
						continue;
					}
					if (!this.plugins[k].is_complete()) {
						BOOMR.debug("Plugin " + k + " is not complete, deferring beacon send");
						return false;
					}
				}
			}

			// For SPA apps, don't strip hashtags as some SPA frameworks use #s for tracking routes
			// instead of History pushState() APIs. Use d.URL instead of location.href because of a
			// Safari bug.
			var isSPA = BOOMR.utils.inArray(impl.vars["http.initiator"], BOOMR.constants.BEACON_TYPE_SPAS);
			var pgu = isSPA ? d.URL : d.URL.replace(/#.*/, "");
			impl.vars.pgu = BOOMR.utils.cleanupURL(pgu);

			// Use the current document.URL if it hasn't already been set, or for SPA apps,
			// on each new beacon (since each SPA soft navigation might change the URL)
			if (!impl.vars.u || isSPA) {
				impl.vars.u = impl.vars.pgu;
			}

			if (impl.vars.pgu === impl.vars.u) {
				delete impl.vars.pgu;
			}

			impl.vars.v = BOOMR.version;

			if (BOOMR.visibilityState()) {
				impl.vars["vis.st"] = BOOMR.visibilityState();
				if (BOOMR.lastVisibilityEvent.visible) {
					impl.vars["vis.lv"] = BOOMR.now() - BOOMR.lastVisibilityEvent.visible;
				}
				if (BOOMR.lastVisibilityEvent.hidden) {
					impl.vars["vis.lh"] = BOOMR.now() - BOOMR.lastVisibilityEvent.hidden;
				}
			}

			impl.vars["ua.plt"] = navigator.platform;
			impl.vars["ua.vnd"] = navigator.vendor;

			if (w !== window) {
				impl.vars["if"] = "";
			}

			for (k in impl.errors) {
				if (impl.errors.hasOwnProperty(k)) {
					errors.push(k + (impl.errors[k] > 1 ? " (*" + impl.errors[k] + ")" : ""));
				}
			}

			if (errors.length > 0) {
				impl.vars.errors = errors.join("\n");
			}

			impl.errors = {};

			// If we reach here, all plugins have completed
			impl.fireEvent("before_beacon", impl.vars);

			// Use the override URL if given
			impl.beacon_url = impl.beacon_url_override || impl.beacon_url;

			// Don't send a beacon if no beacon_url has been set
			// you would do this if you want to do some fancy beacon handling
			// in the `before_beacon` event instead of a simple GET request
			BOOMR.debug("Ready to send beacon: " + BOOMR.utils.objectToString(impl.vars));
			if (!impl.beacon_url) {
				BOOMR.debug("No beacon URL, so skipping.");
				return true;
			}

			// clone the vars object for two reasons: first, so all listeners of
			// onbeacon get an exact clone (in case listeners are doing
			// BOOMR.removeVar), and second, to help build our priority list of vars.
			for (k in impl.vars) {
				if (impl.vars.hasOwnProperty(k)) {
					varsSent[k] = impl.vars[k];
					varsToSend[k] = impl.vars[k];
				}
			}

			//Always send POST
			form = document.createElement("form");
			length = BOOMR.utils.pushVars(form, varsToSend);

			BOOMR.removeVar("qt");

			// If we reach here, we've transferred all vars to the beacon URL.
			// The only thing that can stop it now is if we're rate limited
			impl.fireEvent("onbeacon", varsSent);

			if (!length) {
				// do not make the request if there is no data
				return this;
			}

			BOOMR.sendData(form, "POST");		

			return true;
		},
		
		sendData: function (form, method) {
			var urls = [ impl.beacon_url ];

			form.method = method;
			form.id = "beacon_form";

			// TODO: Determine if we want to send as JSON
			if (window.JSON) {
				form.enctype = "text/plain";
			} else {
				form.enctype = "application/x-www-form-urlencoded";
			}

			if(impl.secondary_beacons && impl.secondary_beacons.length) {
				urls.push.apply(urls, impl.secondary_beacons);
			}


			function remove(id) {
				var el = document.getElementById(id);
				if (el) {
					el.parentNode.removeChild(el);
				}
			}

			function submit() {
				/*eslint-disable no-script-url*/
				var iframe,
				    name = "boomerang_post-" + encodeURIComponent(form.action) + "-" + Math.random();

				// ref: http://terminalapp.net/submitting-a-form-with-target-set-to-a-script-generated-iframe-on-ie/
				try {
					iframe = document.createElement('<iframe name="' + name + '">');	// IE <= 8
				}
				catch (ignore) {
					iframe = document.createElement("iframe");				// everything else
				}

				form.action = urls.shift();
				form.target = iframe.name = iframe.id = name;
				iframe.style.display = form.style.display = "none";
				iframe.src="javascript:false";

				remove(iframe.id);
				remove(form.id);

				document.body.appendChild(iframe);
				document.body.appendChild(form);

				form.submit();

				if (urls.length) {
					BOOMR.setImmediate(submit);
				}

				setTimeout(function() { remove(iframe.id); }, 10000);
			}

			submit();
		},

		/**
		 * Gets the latest ResourceTiming entry for the specified URL
		 * Default sort order is chronological startTime
		 * @param {string} url Resource URL
		 * @param {function} [sort] Sort the entries before returning the last one
		 * @returns {PerformanceEntry|undefined} Entry, or undefined if ResourceTiming is not
		 *          supported or if the entry doesn't exist
		 */
		getResourceTiming: function(url, sort) {
			var entries;

			try {
				if (BOOMR.getPerformance()
					&& typeof BOOMR.getPerformance().getEntriesByName === "function") {
					entries = BOOMR.getPerformance().getEntriesByName(url);
					if (entries && entries.length) {
						if (typeof sort === "function") {
							entries.sort(sort);
						}
						return entries[entries.length - 1];
					}
				}
			}
			catch (ignore) {
				// empty
			}
		}

	};

	delete BOOMR_start;

	if (typeof BOOMR_lstart === "number") {
		boomr.t_lstart = BOOMR_lstart;
		delete BOOMR_lstart;
	}
	else if (typeof BOOMR.window.BOOMR_lstart === "number") {
		boomr.t_lstart = BOOMR.window.BOOMR_lstart;
	}

	if (typeof BOOMR.window.BOOMR_onload === "number") {
		boomr.t_onload = BOOMR.window.BOOMR_onload;
	}

	(function() {
		var make_logger;

		if (typeof console === "object" && console.log !== undefined) {
			boomr.log = function(m, l, s) { console.log(s + ": [" + l + "] " + m); };
		}

		make_logger = function(l) {
			return function(m, s) {
				this.log(m, l, "boomerang" + (s ? "." + s : ""));
				return this;
			};
		};

		boomr.debug = make_logger("debug");
		boomr.info = make_logger("info");
		boomr.warn = make_logger("warn");
		boomr.error = make_logger("error");
	}());



	(function() {
		var ident;
		for (ident in boomr) {
			if (boomr.hasOwnProperty(ident)) {
				BOOMR[ident] = boomr[ident];
			}
		}
		if (!BOOMR.xhr_excludes) {
			//! URLs to exclude from automatic XHR instrumentation
			BOOMR.xhr_excludes = {};
		}
	}());

	dispatchEvent("onBoomerangLoaded", { "BOOMR": BOOMR }, true );

}(window));

// end of boomerang beaconing section

(function() {
	var d, handler, a, impl,
	    singlePageApp = false,
	    autoXhrEnabled = false,
	    alwaysSendXhr = false,
	    readyStateMap = [ "uninitialized", "open", "responseStart", "domInteractive", "responseEnd" ];

	/**
	 * @constant
	 * @desc
	 * Single Page Applications get an additional timeout for all XHR Requests to settle in.
	 * This is used after collecting resources for a SPA routechange
	 * @type {number}
	 * @default
	 */
	var SPA_TIMEOUT = 1000;

	/**
	 * @constant
	 * @desc Timeout event fired for XMLHttpRequest resource
	 * @type {number}
	 * @default
	 */
	var XHR_STATUS_TIMEOUT        = -1001;
	/**
	 * @constant
	 * @desc XMLHttpRequest was aborted
	 * @type {number}
	 * @default
	 */
	var XHR_STATUS_ABORT          = -999;
	/**
	 * @constant
	 * @desc An error code was returned by the HTTP Server
	 * @type {number}
	 * @default
	 */
	var XHR_STATUS_ERROR          = -998;
	/**
	 * @constant
	 * @desc An exception occured as we tried to request resource
	 * @type {number}
	 * @default
	 */
	var XHR_STATUS_OPEN_EXCEPTION = -997;

	// Default resources to count as Back-End during a SPA nav
	var SPA_RESOURCES_BACK_END = ["xmlhttprequest", "script"];

	// If this browser cannot support XHR, we'll just skip this plugin which will
	// save us some execution time.

	// XHR not supported or XHR so old that it doesn't support addEventListener
	// (IE 6, 7, 8, as well as newer running in quirks mode.)
	if (!window.XMLHttpRequest || !(new XMLHttpRequest()).addEventListener) {
		// Nothing to instrument
		return;
	}

	BOOMR = window.BOOMR || {};
	

	if (BOOMR.plugins.AutoXHR) {
		return;
	}

	function log(msg) {
		BOOMR.debug(msg, "AutoXHR");
	}
	/**
	 * @memberof AutoXHR
	 * @desc
	 * Tries to resolve href links from relative URLs
	 * This implementation takes into account a bug in the way IE handles relative paths on anchors and resolves this
	 * by assigning a.href to itself which triggers the URL resolution in IE and will fix missing leading slashes if
	 * necessary
	 *
	 * @param {string} anchor - the anchor object to resolve
	 * @returns {string} - The unrelativized URL href
	 */
	function getPathName(anchor) {
		if (!anchor) {
			return null;
		}

		/*
		 correct relativism in IE
		 anchor.href = "./path/file";
		 anchor.pathname == "./path/file"; //should be "/path/file"
		 */
		anchor.href = anchor.href;

		/*
		 correct missing leading slash in IE
		 anchor.href = "path/file";
		 anchor.pathname === "path/file"; //should be "/path/file"
		 */
		var pathName = anchor.pathname;
		if (pathName.charAt(0) !== "/") {
			pathName = "/" + pathName;
		}

		return pathName;
	}

	/**
	 * @memberof AutoXHR
	 * @private
	 * @desc
	 * Based on the contents of BOOMR.xhr_excludes check if the URL that we instrumented as XHR request
	 * matches any of the URLs we are supposed to not send a beacon about.
	 *
	 * @param {HTMLAnchorElement} anchor - <a> element with URL of the element checked agains BOOMR.xhr_excludes
	 * @returns {boolean} - `true` if intended to be excluded, `false` if it is not in the list of excludables
	 */
	function shouldExcludeXhr(anchor) {
		if (anchor.href && anchor.href.match(/^(about:|javascript:|data:)/i)) {
			return true;
		}

		return BOOMR.xhr_excludes.hasOwnProperty(anchor.href) ||
			BOOMR.xhr_excludes.hasOwnProperty(anchor.hostname) ||
			BOOMR.xhr_excludes.hasOwnProperty(getPathName(anchor));
	}

	/**
	 * @class MutationHandler
	 * @desc
	 * If MutationObserver is supported on the browser we are running on this will handle [case 1]{@link AutoXHR#description} of the AutoXHR
	 * class.
	 */

	/**
	 * @constructor
	 */
	function MutationHandler() {
		this.watch = 0;
		this.timer = null;

		this.pending_events = [];
	}

	/**
	 * @method
	 * @memberof MutationHandler
	 * @static
	 *
	 * @desc
	 * Disable internal MutationObserver instance. Use this when uninstrumenting the site we're on.
	 */
	MutationHandler.stop = function() {
		if (MutationHandler.observer && MutationHandler.observer.observer) {
			MutationHandler.observer.observer.disconnect();
			MutationHandler.observer = null;
		}
	};

	/**
	 * @method
	 * @memberof MutationHandler
	 * @static
	 *
	 * @desc
	 * Initiate {@link MutationHandler.observer} on the [outer parent document]{@link BOOMR.window.document}.
	 * Uses [addObserver}{@link BOOMR.utils.addObserver} to instrument. [Our internal handler]{@link handler#mutation_cb}
	 * will be called if something happens
	 */
	MutationHandler.start = function() {
		// Add a perpetual observer
		MutationHandler.observer = BOOMR.utils.addObserver(
			d,
			{
				childList: true,
				attributes: true,
				subtree: true,
				attributeFilter: ["src", "href"]
			},
			null, // no timeout
			handler.mutation_cb, // will always return true
			null, // no callback data
			handler
		);

		BOOMR.subscribe("page_unload", MutationHandler.stop, null, MutationHandler);
	};

	/**
	 * @method
	 * @memberof MutationHandler
	 *
	 * @desc
	 * If an event has triggered a resource to be fetched we add it to the list of pending events
	 * here and wait for it to eventually resolve.
	 *
	 * @param {object} resource - [Resource]{@link AutoXHR#Resource} object we are waiting for
	 *
	 * @returns {?index} - If we are already waiting for an event of this type null otherwise index in the [queue]{@link MutationHandler#pending_event}.
	 */
	MutationHandler.prototype.addEvent = function(resource) {
		var ev = {
			type: resource.initiator,
			resource: resource,
			nodes_to_wait: 0,
			resources: [],
			complete: false
		},
		    i,
		    last_ev,
		    index = this.pending_events.length;

		for (i = index - 1; i >= 0; i--) {
			if (this.pending_events[i] && !this.pending_events[i].complete) {
				last_ev = this.pending_events[i];
				break;
			}
		}

		if (last_ev) {
			if (last_ev.type === "click") {
				// 3.1 & 3.3
				if (last_ev.nodes_to_wait === 0 || !last_ev.resource.url) {
					this.pending_events[i] = undefined;
					return null;// abort
				}
				// last_ev will no longer receive watches as ev will receive them
				// last_ev will wait fall interesting nodes and then send event
			}
			else if (last_ev.type === "xhr") {
				// 3.2
				if (ev.type === "click") {
					return null;
				}

				// 3.4
				// nothing to do
			}
			else if (BOOMR.utils.inArray(last_ev.type, BOOMR.constants.BEACON_TYPE_SPAS)) {
				// This could occur if this event started prior to the SPA taking
				// over, and is now completing while the SPA event is occuring.  Let
				// the SPA event take control.
				if (ev.type === "xhr") {
					return null;
				}
			}
		}

		this.watch++;
		this.pending_events.push(ev);

		// If we don't have a MutationObserver, then we just abort
		if (!MutationHandler.observer) {
			if (BOOMR.utils.inArray(ev.type, BOOMR.constants.BEACON_TYPE_SPAS)) {
				// try to start it, in case we haven't had the chance to yet
				MutationHandler.start();

				// Give SPAs a bit more time to do something since we know this was
				// an interesting event (e.g. XHRs)
				this.setTimeout(SPA_TIMEOUT, index);

				return index;
			}

			// If we already have detailed resource we can forward the event
			if (resource.url && resource.timing.loadEventEnd) {
				this.sendEvent(index);
			}

			return null;
		}
		else {
			if (!BOOMR.utils.inArray(ev.type, BOOMR.constants.BEACON_TYPE_SPAS)) {
				// Give clicks and history changes 50ms to see if they resulted
				// in DOM mutations (and thus it is an 'interesting event').
				this.setTimeout(50, index);
			}
			else {
				// Give SPAs a bit more time to do something since we know this was
				// an interesting event.
				this.setTimeout(SPA_TIMEOUT, index);
			}

			return index;
		}
	};

	/**
	 * @method
	 * @memberof MutationHandler
	 * @desc
	 *
	 * If called with an event in the [pending events list]{@link MutationHandler#pending_events}
	 * trigger a beacon for this event.
	 *
	 * When the beacon is sent for this event is depending on either having a crumb, in which case this
	 * beacon will be sent immediately. If that is not the case we wait 5 seconds and attempt to send the
	 * event again.
	 *
	 * @param {number} i - index in event list to send
	 *
	 * @returns {undefined} - returns early if the event already completed
	 */
	MutationHandler.prototype.sendEvent = function(i) {
		var ev = this.pending_events[i], self = this;

		if (!ev || ev.complete) {
			return;
		}

		ev.complete = true;

		this.watch--;

		this.clearTimeout();
		if (BOOMR.readyToSend()) {
			ev.resource.resources = ev.resources;

			// if this was an SPA nav that triggered no additional resources, substract the
			// SPA_TIMEOUT from now to determine the end time
			if (ev.type === "spa" && ev.resources.length === 0) {
				ev.resource.timing.loadEventEnd = BOOMR.now() - SPA_TIMEOUT;
			}

			this.sendResource(ev.resource, i);
		}
		else {
			// No crumb, so try again after 5 seconds
			setTimeout(function() { self.sendEvent(i); }, 5000);
		}
	};

	/**
	 * @memberof MutationHandler
	 * @method
	 *
	 * @desc
	 * Creates and triggers sending a beacon for a Resource that has finished loading.
	 *
	 * @param {Resource} resource - The Resource to send a beacon on
	 * @param {number} eventIndex - index of the event in the pending_events array
	 */
	MutationHandler.prototype.sendResource = function(resource, eventIndex) {
		var self = this;

		// Use 'requestStart' as the startTime of the resource, if given
		var startTime = resource.timing ? resource.timing.requestStart : undefined;

		/**
		  * Called once the resource can be sent
		  * @param markEnd Sets loadEventEnd once the function is run
		 */
		var sendResponseEnd = function(markEnd) {
			if (markEnd) {
				resource.timing.loadEventEnd = BOOMR.now();
			}

			// Add ResourceTiming data to the beacon, starting at when 'requestStart'
			// was for this resource.
			if (BOOMR.plugins.ResourceTiming &&
			    BOOMR.plugins.ResourceTiming.is_supported() &&
			    resource.timing &&
			    resource.timing.requestStart) {
				var r = BOOMR.plugins.ResourceTiming.getCompressedResourceTiming(
					resource.timing.requestStart,
					resource.timing.loadEventEnd);

				BOOMR.addVar("restiming", JSON.stringify(r));
			}

			// If the resource has an onComplete event, trigger it.
			if (resource.onComplete) {
				resource.onComplete();
			}

			// For SPAs, calculate Back-End and Front-End timings
			if (BOOMR.utils.inArray(resource.initiator, BOOMR.constants.BEACON_TYPE_SPAS)) {
				self.calculateSpaTimings(resource);
			}

			BOOMR.responseEnd(resource, startTime, resource);

			if (eventIndex) {
				self.pending_events[eventIndex] = undefined;
			}
		};

		// send the beacon if we were not told to hold it
		if (!resource.wait) {
			// if this is a SPA event, make sure it doesn't fire until onload
			if (BOOMR.utils.inArray(resource.initiator, BOOMR.constants.BEACON_TYPE_SPAS)) {
				if (d && d.readyState && d.readyState !== "complete") {
					BOOMR.window.addEventListener("load", function() {
						sendResponseEnd(true);
					});

					return;
				}
			}

			sendResponseEnd(false);
		}
		else {
			// waitComplete() should be called once the held beacon is complete
			resource.waitComplete = function() {
				sendResponseEnd(true);
			};
		}
	};

	/**
	  * Calculates SPA Back-End and Front-End timings for Hard and Soft
	  * SPA navigations.
	  *
	  * @param resource Resouce to calculate for
	 */
	MutationHandler.prototype.calculateSpaTimings = function(resource) {
		var p = BOOMR.getPerformance();
		if (!p || !p.timing) {
			return;
		}

		//
		// Hard Navigation:
		// Use same timers as a traditional navigation, where the root HTML's
		// timestamps are used for Back-End calculation.
		//
		if (resource.initiator === "spa_hard") {
			// ensure RT picks up the correct timestamps
			resource.timing.responseEnd = p.timing.responseStart;
			resource.timing.fetchStart = p.timing.fetchStart;
		}
		else {
			//
			// Soft Navigation:
			// We need to overwrite two timers: Back-End (t_resp) and Front-End (t_page).
			//
			// For Single Page Apps, we're defining these as:
			// Back-End: Any timeslice where a XHR or JavaScript was outstanding
			// Front-End: Total Time - Back-End
			//
			if (!BOOMR.plugins.ResourceTiming) {
				return;
			}

			// first, gather all Resources that were outstanding during this SPA nav
			var resources = BOOMR.plugins.ResourceTiming.getFilteredResourceTiming(
				resource.timing.requestStart,
				resource.timing.loadEventEnd,
				impl.spaBackEndResources);

			// determine the total time based on the SPA logic
			var totalTime = Math.round(resource.timing.loadEventEnd - resource.timing.requestStart);

			if (!resources || !resources.length) {
				if (BOOMR.plugins.ResourceTiming.is_supported()) {
					// If ResourceTiming is supported, but there were no entries,
					// this was all Front-End time
					resource.timers = {
						t_resp: 0,
						t_page: totalTime,
						t_done: totalTime
					};
				}

				return;
			}

			// calculate the Back-End time based on any time those resources were active
			var backEndTime = Math.round(BOOMR.plugins.ResourceTiming.calculateResourceTimingUnion(resources));

			// front-end time is anything left over
			var frontEndTime = totalTime - backEndTime;

			if (backEndTime < 0 || totalTime < 0) {
				// some sort of error, don't put on the beacon
				return;
			}

			// set timers on the resource so RT knows to use them
			resource.timers = {
				t_resp: backEndTime,
				t_page: frontEndTime,
				t_done: totalTime
			};
		}
	};

	/**
	 * @memberof MutationHandler
	 * @method
	 *
	 * @desc
	 * Will create a new timer waiting for `timeout` milliseconds to wait until a resources load time has ended or should have ended.
	 * If the timeout expires the Resource at `index` will be marked as timedout and result in an error Resource marked with
	 * [XHR_STATUS_TIMEOUT]{@link AutoXHR#XHR_STATUS_TIMEOUT} as status information.
	 *
	 * @param {number} timeout - time ot wait for the resource to be loaded
	 * @param {number} index - Index of the {@link Resource} in our {@link MutationHandler#pending_events}
	 */
	MutationHandler.prototype.setTimeout = function(timeout, index) {
		var self = this;
		if (!timeout) {
			return;
		}

		this.clearTimeout();

		this.timer = setTimeout(function() { self.timedout(index); }, timeout);
	};

	/**
	 * @memberof MutationHandler
	 * @method
	 *
	 * @desc
	 * Sends a Beacon for the [Resource]{@link AutoXHR#Resource} at `index` with the status
	 * [XHR_STATUS_TIMEOUT]{@link AutoXHR#XHR_STATUS_TIMEOUT} code, If there are multiple resources attached to the
	 * `pending_events` array at `index`.
	 *
	 * @param {number} index - Index of the event in pending_events array
	 */
	MutationHandler.prototype.timedout = function(index) {
		this.clearTimeout();

		var ev = this.pending_events[index];

		if (ev && BOOMR.utils.inArray(ev.type, BOOMR.constants.BEACON_TYPE_SPAS.concat("xhr"))) {
			// XHRs or SPA page loads
			if (ev.type === "xhr") {
				// always send XHRs on timeout
				this.sendEvent(index);
			}
			else if (BOOMR.utils.inArray(ev.type, BOOMR.constants.BEACON_TYPE_SPAS)
				 && ev.nodes_to_wait === 0) {
				// send page loads (SPAs) if there are no outstanding downloads
				this.sendEvent(index);
			}
			// if there are outstanding downloads left, they will trigger a sendEvent for the SPA once complete
		}
		else {
			if (this.watch > 0) {
				this.watch--;
			}
			this.pending_events[index] = undefined;
		}
	};

	/**
	 * @memberof MutationHandler
	 * @method
	 *
	 * @desc
	 * If this instance of the {@link MutationHandler} has a `timer` set, clear it
	 */
	MutationHandler.prototype.clearTimeout = function() {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	};

	/**
	 * @memberof MutationHandler
	 * @callback load_cb
	 *
	 * @desc
	 * Once an asset has been loaded and the resource appeared in the page we check if it was part of the interesting events
	 * on the page and mark it as finished.
	 *
	 * @param {Event} ev - Load event Object
	 */
	MutationHandler.prototype.load_cb = function(ev, resourceNum) {
		var target, index, now = BOOMR.now();

		target = ev.target || ev.srcElement;
		if (!target || !target._bmr) {
			return;
		}

		index = target._bmr.idx;
		resourceNum = typeof resourceNum !== "undefined" ? resourceNum : (target._bmr.res || 0);

		if (target._bmr.end[resourceNum]) {
			// If we've already set the end value, don't call load_finished
			// again.  This might occur on IMGs that are 404s, which fire
			// 'error' then 'load' events
			return;
		}

		target._bmr.end[resourceNum] = now;

		this.load_finished(index, now);
	};

	/**
	 * @memberof MutationHandler
	 * @method
	 *
	 * @desc
	 * Decrement the number of [nodes_to_wait]{@link AutoXHR#.PendingEvent} for the the
	 * [PendingEvent Object]{@link AutoXHR#.PendingEvent}.
	 *
	 * If the nodes_to_wait is decremented to 0 and the event type was SPA:
	 *
	 * When we're finished waiting on the last node,
	 * the MVC engine (eg AngularJS) might still be doing some processing (eg
	 * on an XHR) before it adds some additional content (eg IMGs) to the page.
	 * We should wait a while (1 second) longer to see if this happens.  If
	 * something else is added, we'll continue to wait for that content to
	 * complete.  If nothing else is added, the end event will be the
	 * timestamp for when this load_finished(), not 1 second from now.
	 *
	 * @param {number} index - Index of the event found in the pending_events array
	 * @param {TimeStamp} loadEventEnd - TimeStamp at which the resource was finnished loading
	 */
	MutationHandler.prototype.load_finished = function(index, loadEventEnd) {
		var current_event = this.pending_events[index];

		// event aborted
		if (!current_event) {
			return;
		}

		current_event.nodes_to_wait--;

		if (current_event.nodes_to_wait === 0) {
			// mark the end timestamp with what was given to us, or, now
			current_event.resource.timing.loadEventEnd = loadEventEnd || BOOMR.now();

			// For Single Page Apps, when we're finished waiting on the last node,
			// the MVC engine (eg AngularJS) might still be doing some processing (eg
			// on an XHR) before it adds some additional content (eg IMGs) to the page.
			// We should wait a while (1 second) longer to see if this happens.  If
			// something else is added, we'll continue to wait for that content to
			// complete.  If nothing else is added, the end event will be the
			// timestamp for when this load_finished(), not 1 second from now.
			if (BOOMR.utils.inArray(current_event.type, BOOMR.constants.BEACON_TYPE_SPAS)) {
				this.setTimeout(SPA_TIMEOUT, index);
			}
			else {
				this.sendEvent(index);
			}
		}
	};

	MutationHandler.prototype.wait_for_node = function(node, index) {
		var self = this, current_event, els, interesting = false, i, l, url, exisitingNodeSrcUrlChanged = false, resourceNum;

		// only images, scripts, iframes and links if stylesheet
		if (node.nodeName.match(/^(IMG|SCRIPT|IFRAME)$/) || (node.nodeName === "LINK" && node.rel && node.rel.match(/\<stylesheet\>/i))) {

			// if the attribute change affected the src/currentSrc attributes we want to know that
			// as that means we need to fetch a new Resource from the server
			if (node._bmr && node._bmr.res && node._bmr.end[node._bmr.res]) {
				exisitingNodeSrcUrlChanged = true;
			}

			url = node.src || node.href;

			if (node.nodeName === "IMG") {
				if (node.naturalWidth && !exisitingNodeSrcUrlChanged) {
					// img already loaded
					return false;
				}
				else if (node.getAttribute("src") === "") {
					// placeholder IMG
					return false;
				}
			}

			// no URL or javascript: or about: or data: URL, so no network activity
			if (!url || url.match(/^(about:|javascript:|data:)/i)) {
				return false;
			}

			current_event = this.pending_events[index];

			if (!current_event) {
				return false;
			}

			// determine the resource number for this request
			resourceNum = current_event.resources.length;

			// create a placeholder ._bmr attribute
			if (!node._bmr) {
				node._bmr = {
					end: {}
				};
			}

			// keep track of all resources (URLs) seen for the root resource
			if (!current_event.urls) {
				current_event.urls = {};
			}

			if (current_event.urls[url]) {
				// we've already seen this URL, no point in waiting on it twice
				return false;
			}

			if (node.nodeName === "SCRIPT" && singlePageApp) {
				// TODO: we currently can't reliably tell when a SCRIPT has already loaded
				return false;
				/*
				 a.href = url;

				 var p = BOOMR.getPerformance()

				 // Check ResourceTiming to see if this was already seen.  If so,
				 // we won't see a 'load' or 'error' event fire, so skip this.
				 if (p && typeof p.getEntriesByType === "function") {
				 entries = p.getEntriesByName(a.href);
				 if (entries && entries.length > 0) {
				 console.error("Skipping " + a.href);
				 return false;
				 }
				 }
				 */
			}

			if (!current_event.resource.url && (node.nodeName === "SCRIPT" || node.nodeName === "IMG")) {
				a.href = url;

				if (shouldExcludeXhr(a)) {
					// excluded resource, so abort
					return false;
				}
				current_event.resource.url = a.href;
			}

			// update _bmr with details about this resource
			node._bmr.res = resourceNum;
			node._bmr.idx = index;

			node.addEventListener("load", function(ev) { self.load_cb(ev, resourceNum); });
			node.addEventListener("error", function(ev) { self.load_cb(ev, resourceNum); });

			current_event.nodes_to_wait++;
			current_event.resources.push(node);

			// Note that we're tracking this URL
			current_event.urls[url] = 1;

			interesting = true;
		}
		else if (node.nodeType === Node.ELEMENT_NODE) {
			els = node.getElementsByTagName("IMG");
			if (els && els.length) {
				for (i = 0, l = els.length; i < l; i++) {
					interesting |= this.wait_for_node(els[i], index);
				}
			}
		}

		return interesting;
	};

	/**
	  * Adds a resource to the current event.
	  *
	  * Might fail (return -1) if:
	  * a) There are no pending events
	  * b) The current event is complete
	  * c) There's no passed-in resource
	  *
	  * @param resource Resource
	  * @return Event index, or -1 on failure
	 */
	MutationHandler.prototype.add_event_resource = function(resource) {
		var index = this.pending_events.length - 1, current_event;
		if (index < 0) {
			return -1;
		}

		current_event = this.pending_events[index];
		if (!current_event) {
			return -1;
		}

		if (!resource) {
			return -1;
		}

		// increase the number of outstanding resources by one
		current_event.nodes_to_wait++;

		resource.index = index;

		return index;
	};

	/**
	 * @callback mutation_cb
	 * @memberof MutationHandler
	 * @desc
	 * Callback called once [Mutation Observer instance]{@link MutationObserver#observer} noticed a mutation on the page.
	 * This method will determine if a mutation on the page is interesting or not.
	 * @param {Mutation[]} mutations - Mutation array describing changes to the DOM
	 */
	MutationHandler.prototype.mutation_cb = function(mutations) {
		var self, index, evt;

		if (!this.watch) {
			return true;
		}

		self = this;
		index = this.pending_events.length - 1;

		if (index < 0 || !this.pending_events[index]) {
			// Nothing waiting for mutations
			return true;
		}

		evt = this.pending_events[index];
		if (typeof evt.interesting === "undefined") {
			evt.interesting = false;
		}

		if (mutations && mutations.length) {
			evt.resource.timing.domComplete = BOOMR.now();

			mutations.forEach(function(mutation) {
				var i, l, node;
				if (mutation.type === "attributes") {
					evt.interesting |= self.wait_for_node(mutation.target, index);
				}
				else if (mutation.type === "childList") {
					// Go through any new nodes and see if we should wait for them
					l = mutation.addedNodes.length;
					for (i = 0; i < l; i++) {
						evt.interesting |= self.wait_for_node(mutation.addedNodes[i], index);
					}

					// Go through any removed nodes, and for IFRAMEs, see if we were
					// waiting for them.  If so, stop waiting, as removed IFRAMEs
					// don't trigger load or error events.
					l = mutation.removedNodes.length;
					for (i = 0; i < l; i++) {
						node = mutation.removedNodes[i];
						if (node.nodeName === "IFRAME" && node._bmr) {
							self.load_cb({target: node, type: "removed"});
						}
					}
				}
			});
		}

		if (!evt.interesting) {
			// if we didn't have any interesting nodes for this MO callback or
			// any prior callbacks, timeout the event
			this.setTimeout(SPA_TIMEOUT, index);
		}

		return true;
	};

	/**
	 * @desc
	 * Determines if the resources queue is empty
	 * @return {boolean} True if there are no outstanding resources
	 */
	MutationHandler.prototype.queue_is_empty = function() {
		if (this.pending_events.length === 0) {
			return true;
		}

		var index = this.pending_events.length - 1;

		if (!this.pending_events[index]) {
			return true;
		}

		if (this.pending_events[index].nodes_to_wait === 0) {
			return true;
		}

		return false;
	};

	handler = new MutationHandler();

	/**
	 * @function
	 * @desc
	 * Subscribe to click events on the page and see if they are triggering new
	 * resources fetched from the network in which case they are interesting
	 * to us!
	 */
	function instrumentClick() {
		// Capture clicks and wait 50ms to see if they result in DOM mutations
		BOOMR.subscribe("click", function() {
			if (singlePageApp) {
				// In a SPA scenario, only route changes (or events from the SPA
				// framework) trigger an interesting event.
				return;
			}

			var resource = { timing: {}, initiator: "click" };

			if (!BOOMR.orig_XMLHttpRequest || BOOMR.orig_XMLHttpRequest === BOOMR.window.XMLHttpRequest) {
				// do nothing if we have un-instrumented XHR
				return;
			}

			resource.timing.requestStart = BOOMR.now();

			handler.addEvent(resource);
		});
	}

	/**
	 * @function
	 * @desc
	 * Replace original window.XMLHttpRequest with our implementation instrumenting any AJAX Requests happening afterwards.
	 * This will also enable instrumentation of mouse events (clicks) and start the {@link MutationHandler}
	 *
	 * @returns {null} - returns early if we need to re-instrument
	 */
	function instrumentXHR() {
		if (BOOMR.proxy_XMLHttpRequest && BOOMR.proxy_XMLHttpRequest === BOOMR.window.XMLHttpRequest) {
			// already instrumented
			return;
		}
		if (BOOMR.proxy_XMLHttpRequest && BOOMR.orig_XMLHttpRequest && BOOMR.orig_XMLHttpRequest === BOOMR.window.XMLHttpRequest) {
			// was once instrumented and then uninstrumented, so just reapply the old instrumented object

			BOOMR.window.XMLHttpRequest = BOOMR.proxy_XMLHttpRequest;
			MutationHandler.start();

			return;
		}

		BOOMR.orig_XMLHttpRequest = BOOMR.window.XMLHttpRequest;

		MutationHandler.start();

		instrumentClick();

		/**
		 * @memberof ProxyXHRImplementation
		 * @desc
		 * Open an XMLHttpRequest.
		 * If the URL passed as a second argument is in the BOOMR.xhr_exclude list ignore it and move on to request it
		 * Otherwise add it to our list of resources to monitor and later beacon on.
		 *
		 * If an exception is caught will call loadFinished and set resource.status to {@link XHR_STATUS_OPEN_EXCEPTION}
		 * Should the resource fail to load for any of the following reasons resource.stat status code will be set to:
		 *
		 * - timeout {Event} {@link XHR_STATUS_TIMEOUT}
		 * - error {Event} {@link XHR_STATUS_ERROR}
		 * - abort {Event} {@link XHR_STATUS_ABORT}
		 *
		 * @param method {String} - HTTP request method
		 * @param url {String} - URL to request on
		 * @param async {boolean} - [optional] if true will setup the EventListeners for XHR events otherwise will set the resource
		 *                          to synchronous. If true or undefined will be automatically set to asynchronous
		 */
		BOOMR.proxy_XMLHttpRequest = function() {
			var req, resource = { timing: {}, initiator: "xhr" }, orig_open, orig_send;

			req = new BOOMR.orig_XMLHttpRequest();

			orig_open = req.open;
			orig_send = req.send;

			req.open = function(method, url, async) {
				a.href = url;

				if (shouldExcludeXhr(a)) {
					// skip instrumentation and call the original open method
					return orig_open.apply(req, arguments);
				}

				// Default value of async is true
				if (async === undefined) {
					async = true;
				}

				/**
				 * @memberof ProxyXHRImplementation
				 * @desc
				 * Mark this as the time load ended via resources loadEventEnd property, if this resource has been added
				 * to the {@link MutationHandler} already notify that the resource has finished.
				 * Otherwise add this call to the lise of Events that occured.
				 */
				function loadFinished() {
					var entry, navSt, useRT = false;

					// if we already finished via readystatechange or an error event,
					// don't do work again
					if (resource.timing.loadEventEnd) {
						return;
					}

					// fire an event for anyone listening
					if (resource.status) {
						BOOMR.fireEvent("onxhrerror", resource);
					}

					resource.timing.loadEventEnd = BOOMR.now();

					// if ResourceTiming is available, fix-up the XHR time with the timestamps from that data, as it will be more accurate.
					entry = BOOMR.getResourceTiming(resource.url, function(x, y) { return x.responseEnd - y.responseEnd; });
					if (entry) {
						navSt = BOOMR.getPerformance().timing.navigationStart;

						// re-set the timestamp to make sure it's greater than values in resource timing entry
						resource.timing.loadEventEnd = BOOMR.now();
						if (entry.responseEnd !== 0) {
							// sanity check to see if the entry should be used for this resource
							if (Math.floor(navSt + entry.responseEnd) <= resource.timing.loadEventEnd) {
								resource.timing.responseEnd = Math.round(navSt + entry.responseEnd);
								useRT = true;
							}
						}

						if (useRT && entry.responseStart !== 0) {
							resource.timing.responseStart = Math.round(navSt + entry.responseStart);
						}

						if (useRT && entry.startTime !== 0) {
							resource.timing.requestStart = Math.round(navSt + entry.startTime);
						}
					}

					if (resource.index > -1) {
						// If this XHR was added to an existing event, fire the
						// load_finished handler for that event.
						handler.load_finished(resource.index, resource.timing.responseEnd);
					}
					else if (alwaysSendXhr) {
						handler.sendResource(resource);
					}
					else if (!singlePageApp || autoXhrEnabled) {
						// Otherwise, if this is a SPA+AutoXHR or just plain
						// AutoXHR, use addEvent() to see if this will trigger
						// a new interesting event.
						handler.addEvent(resource);
					}
				}

				/**
				 * @memberof ProxyXHRImplementation
				 * @desc
				 * Setup an {EventListener} for Event @param{ename}. This function will make sure the timestamp for the resources request is set and calls
				 * loadFinished should the resource have finished. See {@link open()} for it's usage
				 *
				 * @param ename {String} Eventname to listen on via addEventListener
				 * @param stat {String} if that {@link ename} is reached set this as the status of the resource
				 */
				function addListener(ename, stat) {
					req.addEventListener(
						ename,
						function() {
							if (ename === "readystatechange") {
								resource.timing[readyStateMap[req.readyState]] = BOOMR.now();

								// Listen here as well, as DOM changes might happen on other listeners
								// of readyState = 4 (complete), and we want to make sure we've
								// started the addEvent() if so.  Only listen if the status is non-zero,
								// meaning the request wasn't aborted.  Aborted requests will fire the
								// next handler.
								if (req.readyState === 4 && req.status !== 0) {
									if (req.status < 200 || req.status >= 400) {
										// put the HTTP error code on the resource if it's not a success
										resource.status = req.status;
									}

									loadFinished();
								}
							}
							else {// load, timeout, error, abort
								resource.status = (stat === undefined ? req.status : stat);

								loadFinished();
							}
						},
						false
					);
				}

				if (singlePageApp && handler.watch && !alwaysSendXhr) {
					// If this is a SPA and we're already watching for resources due
					// to a route change or other interesting event, add this to the
					// current event.
					handler.add_event_resource(resource);
				}

				if (async) {
					addListener("readystatechange");
				}

				addListener("load");
				addListener("timeout", XHR_STATUS_TIMEOUT);
				addListener("error",   XHR_STATUS_ERROR);
				addListener("abort",   XHR_STATUS_ABORT);

				resource.url = a.href;
				resource.method = method;

				// reset any statuses from previous calls to .open()
				delete resource.status;

				if (!async) {
					resource.synchronous = true;
				}

				// call the original open method
				try {
					return orig_open.apply(req, arguments);
				}
				catch (e) {
					// if there was an exception during .open(), .send() won't work either,
					// so let's fire loadFinished now
					resource.status = XHR_STATUS_OPEN_EXCEPTION;
					loadFinished();
				}
			};

			/**
			 * @memberof ProxyXHRImplementation
			 * @desc
			 * Mark requestStart timestamp and start the request unless the resource has already been marked as having an error code or a result to itself.
			 * @returns {Object} The data normal XHR.send() would return
			 */
			req.send = function() {
				resource.timing.requestStart = BOOMR.now();

				// call the original send method unless there was an error
				// during .open
				if (typeof resource.status === "undefined" ||
				    resource.status !== XHR_STATUS_OPEN_EXCEPTION) {
					return orig_send.apply(req, arguments);
				}
			};

			req.resource = resource;

			return req;
		};

		// set our proxy's prototype to the original XHR prototype, in case anyone
		// is using it to save state
		BOOMR.proxy_XMLHttpRequest.prototype = BOOMR.orig_XMLHttpRequest.prototype;

		BOOMR.window.XMLHttpRequest = BOOMR.proxy_XMLHttpRequest;
	}

	/**
	 * @function
	 * @desc
	 * Put original XMLHttpRequest Configuration back into place
	 */
	function uninstrumentXHR() {
		if (BOOMR.orig_XMLHttpRequest && BOOMR.orig_XMLHttpRequest !== BOOMR.window.XMLHttpRequest) {
			BOOMR.window.XMLHttpRequest = BOOMR.orig_XMLHttpRequest;
		}
	}

	/**
	  * Sends an XHR resource
	 */
	function sendResource(resource) {
		resource.initiator = "xhr";
		BOOMR.responseEnd(resource);
	}

	impl = {
		spaBackEndResources: SPA_RESOURCES_BACK_END
	};

	/**
	 * @module AutoXHR
	 * @desc
	 * How should this work?
	 *
	 * 0. History changed
	 *
	 * - Pass new URL and timestamp of change on to most recent event (which might not have happened yet)
	 *
	 * 0.1. History changes as a result of a pushState or replaceState
	 * - In this case we get the new URL when the developer calls pushState or replaceState
	 * - we do not know if they plan to make an XHR call or use a dynamic script node, or do nothing interesting
	 *  (eg: just make a div visible/invisible)
	 * - we also do not know if they will do this before or after they've called pushState/replaceState
	 * - so our best bet is to check if either an XHR event or an interesting Mutation event happened in the last 50ms,
	 *  and if not, then hold on to this state for 50ms to see if an interesting event will happen.
	 *
	 * 0.2. History changes as a result of the user hitting Back/Forward and we get a window.popstate event
	 * - In this case we get the new URL from location.href when our event listener runs
	 * - we do not know if this event change will result in some interesting network activity or not
	 * - we do not know if the developer's event listener has already run before ours or if it will run in the future
	 *  or even if they do have an event listener
	 * - so our best bet is the same as 0.1 above
	 *
	 *
	 * 1. Click initiated
	 *
	 * - User clicks on something
	 * - We create a resource with the start time and no URL
	 * - We turn on DOM observer, and wait up to 50 milliseconds for something
	 *  - If nothing happens after the timeout, we stop watching and clear the resource without firing the event
	 *  - If a history event happened recently/will happen shortly, use the URL as the resource.url
	 *  - Else if something uninteresting happens, we extend the timeout for 1 second
	 *  - Else if an interesting node is added, we add load and error listeners and turn off the timeout but keep watching
	 *    - If we do not have a resource.url, and if this is a script, then we use the script's URL
	 *    - Once all listeners have fired, we stop watching, fire the event and clear the resource
	 *
	 *
	 * 2. XHR initiated
	 *
	 * - XHR request is sent
	 * - We create a resource with the start time and the request URL
	 * - If a history event happened recently/will happen shortly, use the URL as the resource.url
	 * - We watch for all changes in state (for async requests) and for load (for all requests)
	 * - On load, we turn on DOM observer, and wait up to 50 milliseconds for something
	 *  - If something uninteresting happens, we extend the timeout for 1 second
	 *  - Else if an interesting node is added, we add load and error listeners and turn off the timeout
	 *    - Once all listeners have fired, we stop watching, fire the event and clear the resource
	 *  - If nothing happens after the timeout, we stop watching fire the event and clear the resource
	 *
	 *
	 * 3. What about overlap?
	 *
	 * 3.1. XHR initiated while click watcher is on
	 *
	 * - If first click watcher has not detected anything interesting or does not have a URL, abort it
	 * - If the click watcher has detected something interesting and has a URL, then
	 *  - Proceed with 2 above.
	 *  - concurrently, click stops watching for new resources
	 *   - once all resources click is waiting for have completed, fire the event and clear click resource
	 *
	 * 3.2. click initiated while XHR watcher is on
	 *
	 * - Ignore click
	 *
	 * 3.3. click initiated while click watcher is on
	 *
	 * - If first click watcher has not detected anything interesting or does not have a URL, abort it
	 * - Else proceed with parallel resource steps from 3.1 above
	 *
	 * 3.4. XHR initiated while XHR watcher is on
	 *
	 * - Allow anything interesting detected by first XHR watcher to complete and fire event
	 * - Start watching for second XHR and proceed with 2 above.
	 */
	BOOMR.plugins.AutoXHR = {
		is_complete: function() { return true; },
		init: function(config) {
			var i;

			// if we don't have window, abort
			if (!BOOMR.window || !BOOMR.window.document) {
				return;
			}

			d = BOOMR.window.document;
			a = BOOMR.window.document.createElement("A");

			// gather config and config overrides
			BOOMR.utils.pluginConfig(impl, config, "AutoXHR", ["spaBackEndResources"]);

			BOOMR.instrumentXHR = instrumentXHR;
			BOOMR.uninstrumentXHR = uninstrumentXHR;

			autoXhrEnabled = config.instrument_xhr;

			// check to see if any of the SPAs were enabled
			if (BOOMR.plugins.SPA && BOOMR.plugins.SPA.supported_frameworks) {
				var supported = BOOMR.plugins.SPA.supported_frameworks();
				for (i = 0; i < supported.length; i++) {
					var spa = supported[i];
					if (config[spa] && config[spa].enabled) {
						singlePageApp = true;
						break;
					}
				}
			}

			// Whether or not to always send XHRs.  If a SPA is enabled, this means it will
			// send XHRs during the hard and soft navs.  If enabled, it will also disable
			// listening for MutationObserver events after an XHR is complete.
			alwaysSendXhr = config.AutoXHR && config.AutoXHR.alwaysSendXhr;
			if (alwaysSendXhr && autoXhrEnabled && BOOMR.xhr && typeof BOOMR.xhr.stop === "function") {
				var resources = BOOMR.xhr.stop(function(res) {
					// any resource callbacks should happen in an setImmediate in case the rest
					// of the plugins haven't yet been initialized
					BOOMR.setImmediate(function sendAgain() {
						// wait until we have a crumb to send
						if (!BOOMR.readyToSend()) {
							setTimeout(sendAgain, 1000);
							return;
						}

						sendResource(res);
					});
				});

				if (resources && resources.length) {
					var sendNow = function() {
						// wait until we have a crumb to send
						if (!BOOMR.readyToSend()) {
							setTimeout(sendNow, 1000);
							return;
						}

						for (i = 0; i < resources.length; i++) {
							sendResource(resources[i]);
						}
					};

					BOOMR.setImmediate(sendNow);
				}
			}

			if (singlePageApp) {
				if (!alwaysSendXhr) {
					// Disable auto-xhr until the SPA has fired its first beacon.  The
					// plugin will re-enable after it's ready.
					autoXhrEnabled = false;
				}

				BOOMR.instrumentXHR();
			}
			else if (autoXhrEnabled) {
				BOOMR.instrumentXHR();
			}
			else if (autoXhrEnabled === false) {
				BOOMR.uninstrumentXHR();
			}

			BOOMR.registerEvent("onxhrerror");
		},
		getMutationHandler: function() {
			return handler;
		},
		getPathname: getPathName,
		enableAutoXhr: function() {
			autoXhrEnabled = true;
		}
	};

	/**
	 * @typedef {Object} Resource
	 * @memberof AutoXHR
	 *
	 * @desc
	 * Resource objects define properties of a page element or resource monitored by {@link AutoXHR}.
	 *
	 * @property {string} initiator - Type of source that initiated the resource to be fetched:
	 * 				  `click`, `xhr` or SPA initiated
	 * @property {string} url - Path to the resource fetched from either the HTMLElement or XHR request that triggered it
	 * @property {object} timing - Resource timing information gathered from internal timers or ResourceTiming if supported
	 * @property {Timing} timing - Object containing start and end timings of the resource if set
	 * @property {?onComplete} [onComplete] - called once the resource has been fetched
	 */

	/**
	 * @callback onComplete
	 * @desc
	 * Hook called once a resource is found to be loaded and timers have been set.
	 */

	/**
	 * @typedef PendingEvent
	 * @memberof AutoXHR
	 * @private
	 * @desc
	 * An event on a page instrumented by {@link AutoXHR#MutationHandler} and monitored by AutoXHR
	 *
	 * @property {string} type - The type of event that we are watching (`xhr`, `click`, [SPAs]{@link BOOMR#constants.BEACON_TYPE_SPAS})
	 * @property {number} nodes_to_wait - Number of nodes to wait for before event completes
	 * @property {Resource} resource - The resource this event is attached to
	 * @property {boolean} complete - `true` if event completed `false` if not
	 * @property {?Resource[]} resources - multiple resources that are attached to this event
	 */

	/**
	 * @typedef Timing
	 * @memberof AutoXHR
	 * @private
	 * @desc
	 * Timestamps for start of a request and end of loading
	 *
	 * @property {TimeStamp} loadEventEnd - Timestamp when the resource arrived in the browser
	 * @property {TimeStamp} requestStart - High resolution timestamp when the resource was started to be loaded
	 */
})();

/*global BOOMR*/
(function() {
	var impl = {
		auto: false,
		enabled: true,
		hooked: false,
		routeHooked: false,
		hadMissedRouteChange: false,
		routeChangeInProgress: false
	};

	// Checking for Plugins required and if already integrated
	if (BOOMR.plugins.History || typeof BOOMR.plugins.SPA === "undefined" || typeof BOOMR.plugins.AutoXHR === "undefined") {
		return;
	}

	// History object not available on the window object
	if (!BOOMR.window || !BOOMR.window.history) {
		return;
	}

	// register as a SPA plugin
	BOOMR.plugins.SPA.register("History");

	/**
	 * Debug logging for this instance
	 *
	 * @param {string} msg Message
	 */
	function log(msg) {
		BOOMR.debug(msg, "History");
	}

	/**
	 * @method
	 * @desc
	 * If enabled and another route change is not in progress send a route_change() event
	 * Otherwise log a warning and set hadMissed a routeChange as missed
	 */
	function routeChange() {
		if (!impl.enabled) {
			log("Not enabled - we've missed a routeChange");
			impl.hadMissedRouteChange = true;
			impl.routeChangeInProgress = false;
		}
		else {
			if (!impl.routeChangeInProgress) {
				log("routeChange triggered, sending route_change() event");
				impl.routeChangeInProgress = true;
				BOOMR.plugins.SPA.route_change();
			}
			else {
				log("routeChangeInProgress, not triggering");
			}
		}
	}

	/**
	 * @method
	 * @desc
	 * Hook into History Object either custom to your application or general on the window object
	 *
	 * This function will override the following functions if available:
	 *   - listen
	 *   - transitionTo
	 *   - pushState
	 *   - setState
	 *   - replaceState
	 *   - go
	 *
	 * @param {object} history - Custom or global History object instance
	 */
	function hook(history) {
		if (!history) {
			history = BOOMR.window.history;
		}

		var orig_history = {
			listen: history.listen,
			transitionTo: history.transitionTo,
			pushState: history.pushState,
			setState: history.setState,
			replaceState: history.replaceState,
			go: history.go
		};

		history.setState = function() {
			log("setState");
			routeChange();
			orig_history.setState.apply(this, arguments);
		};

		history.listen = function() {
			log("listen");
			routeChange();
			orig_history.listen.apply(this, arguments);
		};

		history.transitionTo = function() {
			log("transitionTo");
			routeChange();
			orig_history.transitionTo.apply(this, arguments);
		};

		history.pushState = function(state, title, url) {
			log("pushState");
			routeChange();
			orig_history.pushState.apply(this, arguments);
		};

		history.replaceState = function() {
			log("replaceState");
			routeChange();
			orig_history.replaceState.apply(this, arguments);
		};

		history.go = function() {
			log("go");
			routeChange();
			orig_history.go.apply(this, arguments);
		};

		BOOMR.window.addEventListener("hashchange", function() {
			log("hashchange");
			routeChange();
		});

		BOOMR.subscribe("onbeacon", function() {
			log("Beacon sending, resetting routeChangeInProgress.");
			impl.routeChangeInProgress = false;
		});

		return true;
	}

	BOOMR.plugins.History = {
		is_complete: function() {
			return true;
		},
		hook: function(history, hadRouteChange, options) {
			if (impl.hooked) {
				return this;
			}

			if (hook(history)) {
				BOOMR.plugins.SPA.hook(hadRouteChange, options);
				impl.hooked = true;
			}

			return this;
		},
		init: function(config) {
			BOOMR.utils.pluginConfig(impl, config, "History", ["auto", "enabled"]);

			if (impl.auto && impl.enabled) {
				this.hook(undefined, false, {});
			}
		},
		disable: function() {
			impl.enabled = false;
			return this;
		},
		enable: function() {
			impl.enabled = true;

			if (impl.hooked && impl.hadMissedRouteChange) {
				impl.hadMissedRouteChange = false;
				BOOMR.plugins.SPA.route_change();
				impl.routeChangeInProgress = true;
				log("Hooked and hadMissedRouteChange sending route_change!");
			}

			return this;
		}
	};
}());

/*
 * Copyright (c) 2011, Yahoo! Inc.  All rights reserved.
 * Copyright (c) 2012, Log-Normal, Inc.  All rights reserved.
 * Copyrights licensed under the BSD License. See the accompanying LICENSE.txt file for terms.
 */

// This is the Round Trip Time plugin.  Abbreviated to RT
// the parameter is the window
(function(w) {

/*eslint no-underscore-dangle:0*/

	var d, impl,
	    COOKIE_EXP = 60 * 60 * 24 * 7;


	
	
	if (BOOMR.plugins.RT) {
		return;
	}

	// private object
	impl = {
		onloadfired: false,	//! Set when the page_ready event fires
					//  Use this to determine if unload fires before onload
		unloadfired: false,	//! Set when the first unload event fires
					//  Use this to make sure we don't beacon twice for beforeunload and unload
		visiblefired: false,	//! Set when page becomes visible (Chrome/IE)
					//  Use this to determine if user bailed without opening the tab
		initialized: false,	//! Set when init has completed to prevent double initialization
		complete: false,	//! Set when this plugin has completed
		autorun: true,
		timers: {},		//! Custom timers that the developer can use
					// Format for each timer is { start: XXX, end: YYY, delta: YYY-XXX }
		cookie: "RT",		//! Name of the cookie that stores the start time and referrer
		cookie_exp: COOKIE_EXP,	//! Cookie expiry in seconds (7 days)
		strict_referrer: true,	//! By default, don't beacon if referrers don't match.
					// If set to false, beacon both referrer values and let
					// the back end decide

		navigationType: 0,	// Navigation Type from the NavTiming API.  We mainly care if this was BACK_FORWARD
					// since cookie time will be incorrect in that case
		navigationStart: undefined,
		responseStart: undefined,
		t_start: undefined,	// t_start that came off the cookie
		cached_t_start: undefined,	// cached value of t_start once we know its real value
		cached_xhr_start: undefined,	// cached value of xhr t_start once we know its real value
		t_fb_approx: undefined,	// approximate first byte time for browsers that don't support navtiming
		r: undefined,		// referrer from the cookie
		r2: undefined,		// referrer from document.referer

		// These timers are added directly as beacon variables
		basic_timers: { t_done: 1, t_resp: 1, t_page: 1},

		// Vars that were added to the beacon that we can remove after beaconing
		addedVars: [],

		/**
		 * Merge new cookie `params` onto current cookie, and set `timer` param on cookie to current timestamp
		 * @param params object containing keys & values to merge onto current cookie.  A value of `undefined`
		 *		 will remove the key from the cookie
		 * @param timer  string key name that will be set to the current timestamp on the cookie
		 *
		 * @returns true if the cookie was updated, false if the cookie could not be set for any reason
		 */
		updateCookie: function(params, timer) {
			var t_end, t_start, subcookies, k;

			// Disable use of RT cookie by setting its name to a falsy value
			if (!this.cookie) {
				return false;
			}

			subcookies = BOOMR.utils.getSubCookies(BOOMR.utils.getCookie(this.cookie)) || {};

			if (typeof params === "object") {
				for (k in params) {
					if (params.hasOwnProperty(k)) {
						if (params[k] === undefined ) {
							if (subcookies.hasOwnProperty(k)) {
								delete subcookies[k];
							}
						}
						else {
							if (k === "nu" || k === "r") {
								params[k] = BOOMR.utils.hashQueryString(params[k], true);
							}

							subcookies[k] = params[k];
						}
					}
				}
			}

			t_start = BOOMR.now();

			if (timer) {
				subcookies[timer] = t_start;
				impl.lastActionTime = t_start;
			}

			BOOMR.debug("Setting cookie (timer=" + timer + ")\n" + BOOMR.utils.objectToString(subcookies), "rt");
			if (!BOOMR.utils.setCookie(this.cookie, subcookies, this.cookie_exp)) {
				BOOMR.error("cannot set start cookie", "rt");
				return false;
			}

			t_end = BOOMR.now();
			if (t_end - t_start > 50) {
				// It took > 50ms to set the cookie
				// The user Most likely has cookie prompting turned on so
				// t_start won't be the actual unload time
				// We bail at this point since we can't reliably tell t_done
				BOOMR.utils.removeCookie(this.cookie);

				// at some point we may want to log this info on the server side
				BOOMR.error("took more than 50ms to set cookie... aborting: "
						+ t_start + " -> " + t_end, "rt");
			}

			return true;
		},

		/**
		 * Read initial values from cookie and clear out cookie values it cares about after reading.
		 * This makes sure that other pages (eg: loaded in new tabs) do not get an invalid cookie time.
		 * This method should only be called from init, and may be called more than once.
		 *
		 * Request start time is the greater of last page beforeunload or last click time
		 * If start time came from a click, we check that the clicked URL matches the current URL
		 * If it came from a beforeunload, we check that cookie referrer matches document.referrer
		 *
		 * If we had a pageHide time or unload time, we use that as a proxy for first byte on non-navtiming
		 * browsers.
		 */
		initFromCookie: function() {
			var url, subcookies;
			subcookies = BOOMR.utils.getSubCookies(BOOMR.utils.getCookie(this.cookie));

			if (!subcookies) {
				return;
			}

			subcookies.s = Math.max(+subcookies.ld || 0, Math.max(+subcookies.ul || 0, +subcookies.cl || 0));

			BOOMR.debug("Read from cookie " + BOOMR.utils.objectToString(subcookies), "rt");

			// If we have a start time, and either a referrer, or a clicked on URL,
			// we check if the start time is usable
			if (subcookies.s && (subcookies.r || subcookies.nu)) {
				this.r = subcookies.r;
				url = BOOMR.utils.hashQueryString(d.URL, true);

				// Either the URL of the page setting the cookie needs to match document.referrer
				BOOMR.debug(this.r + " =?= " + this.r2, "rt");

				// Or the start timer was no more than 15ms after a click or form submit
				// and the URL clicked or submitted to matches the current page's URL
				// (note the start timer may be later than click if both click and beforeunload fired
				// on the previous page)
				BOOMR.debug(subcookies.s + " <? " + (+subcookies.cl + 15), "rt");
				BOOMR.debug(subcookies.nu + " =?= " + url, "rt");

				if (!this.strict_referrer ||
					(subcookies.nu && subcookies.nu === url && subcookies.s < +subcookies.cl + 15) ||
					(subcookies.s === +subcookies.ul && this.r === this.r2)
				) {
					this.t_start = subcookies.s;

					// additionally, if we have a pagehide, or unload event, that's a proxy
					// for the first byte of the current page, so use that wisely
					if (+subcookies.hd > subcookies.s) {
						this.t_fb_approx = parseInt(subcookies.hd, 10);
					}
				}
				else {
					this.t_start = this.t_fb_approx = undefined;
				}
			}

			// Now that we've pulled out the timers, we'll clear them so they don't pollute future calls
			this.updateCookie({
				s: undefined,	// start timer
				r: undefined,	// referrer
				nu: undefined,	// clicked url
				ul: undefined,	// onbeforeunload time
				cl: undefined,	// onclick time
				hd: undefined,	// onunload or onpagehide time
				ld: undefined,	// last load time
				rl: undefined
			});
		},

		/**
		 * Figure out how long boomerang and other URLs took to load using
		 * ResourceTiming if available, or built in timestamps.
		 */
		getBoomerangTimings: function() {
			var res, urls, url, startTime, data;

			function trimTiming(time, st) {
				// strip from microseconds to milliseconds only
				var timeMs = Math.round(time ? time : 0),
				    startTimeMs = Math.round(st ? st : 0);

				timeMs = (timeMs === 0 ? 0 : (timeMs - startTimeMs));

				return timeMs ? timeMs : "";
			}

			if (BOOMR.t_start) {
				// How long does it take Boomerang to load up and execute (fb to lb)?
				BOOMR.plugins.RT.startTimer("boomerang", BOOMR.t_start);
				BOOMR.plugins.RT.endTimer("boomerang", BOOMR.t_end);	// t_end === null defaults to current time

				// How long did it take from page request to boomerang fb?
				BOOMR.plugins.RT.endTimer("boomr_fb", BOOMR.t_start);

				if (BOOMR.t_lstart) {
					// when did the boomerang loader start loading boomerang on the page?
					BOOMR.plugins.RT.endTimer("boomr_ld", BOOMR.t_lstart);
					// What was the network latency for boomerang (request to first byte)?
					BOOMR.plugins.RT.setTimer("boomr_lat", BOOMR.t_start - BOOMR.t_lstart);
				}
			}

			// use window and not w because we want the inner iframe
			try {
				if (window
				    && "performance" in window
				    && window.performance
				    && typeof window.performance.getEntriesByName === "function") {
					urls = { "rt.bmr": BOOMR.url };


					for (url in urls) {
						if (urls.hasOwnProperty(url) && urls[url]) {
							res = window.performance.getEntriesByName(urls[url]);
							if (!res || res.length === 0 || !res[0]) {
								continue;
							}

							res = res[0];

							startTime = trimTiming(res.startTime, 0);
							data = [
								startTime,
								trimTiming(res.responseEnd, startTime),
								trimTiming(res.responseStart, startTime),
								trimTiming(res.requestStart, startTime),
								trimTiming(res.connectEnd, startTime),
								trimTiming(res.secureConnectionStart, startTime),
								trimTiming(res.connectStart, startTime),
								trimTiming(res.domainLookupEnd, startTime),
								trimTiming(res.domainLookupStart, startTime),
								trimTiming(res.redirectEnd, startTime),
								trimTiming(res.redirectStart, startTime)
							].join(",").replace(/,+$/, "");

							BOOMR.addVar(url, data);
							impl.addedVars.push(url);
						}
					}
				}
			}
			catch (e) {
				BOOMR.addError(e, "rt.getBoomerangTimings");
			}
		},

		/**
		 * Check if we're in a prerender state, and if we are, set additional timers.
		 * In Chrome/IE, a prerender state is when a page is completely rendered in an in-memory buffer, before
		 * a user requests that page.  We do not beacon at this point because the user has not shown intent
		 * to view the page.  If the user opens the page, the visibility state changes to visible, and we
		 * fire the beacon at that point, including any timing details for prerendering.
		 *
		 * Sets the `t_load` timer to the actual value of page load time (request initiated by browser to onload)
		 *
		 * @returns true if this is a prerender state, false if not (or not supported)
		 */
		checkPreRender: function() {
			if (BOOMR.visibilityState() !== "prerender") {
				return false;
			}

			// This means that onload fired through a pre-render.  We'll capture this
			// time, but wait for t_done until after the page has become either visible
			// or hidden (ie, it moved out of the pre-render state)
			// http://code.google.com/chrome/whitepapers/pagevisibility.html
			// http://www.w3.org/TR/2011/WD-page-visibility-20110602/
			// http://code.google.com/chrome/whitepapers/prerender.html

			BOOMR.plugins.RT.startTimer("t_load", this.navigationStart);
			BOOMR.plugins.RT.endTimer("t_load");					// this will measure actual onload time for a prerendered page
			BOOMR.plugins.RT.startTimer("t_prerender", this.navigationStart);
			BOOMR.plugins.RT.startTimer("t_postrender");				// time from prerender to visible or hidden

			return true;
		},

		/**
		 * Initialise timers from the NavigationTiming API.  This method looks at various sources for
		 * Navigation Timing, and also patches around bugs in various browser implementations.
		 * It sets the beacon parameter `rt.start` to the source of the timer
		 */
		initFromNavTiming: function() {
			var ti, p, source;

			if (this.navigationStart) {
				return;
			}

			// Get start time from WebTiming API see:
			// https://dvcs.w3.org/hg/webperf/raw-file/tip/specs/NavigationTiming/Overview.html
			// http://blogs.msdn.com/b/ie/archive/2010/06/28/measuring-web-page-performance.aspx
			// http://blog.chromium.org/2010/07/do-you-know-how-slow-your-web-page-is.html
			p = BOOMR.getPerformance();

			if (p && p.navigation) {
				this.navigationType = p.navigation.type;
			}

			if (p && p.timing) {
				ti = p.timing;
			}
			else if (w.chrome && w.chrome.csi && w.chrome.csi().startE) {
				// Older versions of chrome also have a timing API that's sort of documented here:
				// http://ecmanaut.blogspot.com/2010/06/google-bom-feature-ms-since-pageload.html
				// source here:
				// http://src.chromium.org/viewvc/chrome/trunk/src/chrome/renderer/loadtimes_extension_bindings.cc?view=markup
				ti = {
					navigationStart: w.chrome.csi().startE
				};
				source = "csi";
			}
			else if (w.gtbExternal && w.gtbExternal.startE()) {
				// The Google Toolbar exposes navigation start time similar to old versions of chrome
				// This would work for any browser that has the google toolbar installed
				ti = {
					navigationStart: w.gtbExternal.startE()
				};
				source = "gtb";
			}

			if (ti) {
				// Always use navigationStart since it falls back to fetchStart (not with redirects)
				// If not set, we leave t_start alone so that timers that depend
				// on it don't get sent back.  Never use requestStart since if
				// the first request fails and the browser retries, it will contain
				// the value for the new request.
				BOOMR.addVar("rt.start", source || "navigation");
				this.navigationStart = ti.navigationStart || ti.fetchStart || undefined;
				this.responseStart = ti.responseStart || undefined;

				// bug in Firefox 7 & 8 https://bugzilla.mozilla.org/show_bug.cgi?id=691547
				if (navigator.userAgent.match(/Firefox\/[78]\./)) {
					this.navigationStart = ti.unloadEventStart || ti.fetchStart || undefined;
				}
			}
			else {
				BOOMR.warn("This browser doesn't support the WebTiming API", "rt");
			}

			return;
		},

		/**
		 * Validate that the time we think is the load time is correct.  This can be wrong if boomerang was loaded
		 * after onload, so in that case, if navigation timing is available, we use that instead.
		 */
		validateLoadTimestamp: function(t_now, data, ename) {
			var p;

			// beacon with detailed timing information
			if (data && data.timing && data.timing.loadEventEnd) {
				return data.timing.loadEventEnd;
			}
			else if (ename === "xhr" && (!data || !BOOMR.utils.inArray(data.initiator, BOOMR.constants.BEACON_TYPE_SPAS))) {
				// if this is an XHR event, trust the input end "now" timestamp
				return t_now;
			}
			// Boomerang loaded late and...
			else if (BOOMR.loadedLate) {
				p = BOOMR.getPerformance();

				// We have navigation timing,
				if (p && p.timing) {
					// and boomerang loaded after onload fired
					if (p.timing.loadEventStart && p.timing.loadEventStart < BOOMR.t_end) {
						return p.timing.loadEventStart;
					}
				}
				// We don't have navigation timing,
				else {
					// So we'll just use the time when boomerang was added to the page
					// Assuming that this means boomerang was added in onload.  If we logged the
					// onload timestamp (via loader snippet), use that first.
					return BOOMR.t_onload || BOOMR.t_lstart || BOOMR.t_start || t_now;
				}
			}

			// default to now
			return t_now;
		},

		/**
		 * Set timers appropriate at page load time.  This method should be called from done() only when
		 * the page_ready event fires.  It sets the following timer values:
		 *		- t_resp:	time from request start to first byte
		 *		- t_page:	time from first byte to load
		 *		- t_postrender	time from prerender state to visible state
		 *		- t_prerender	time from navigation start to visible state
		 *
		 * @param ename  The Event name that initiated this control flow
		 * @param t_done The timestamp when the done() method was called
		 * @param data   Event data passed in from the caller.  For xhr beacons, this may contain detailed timing information
		 *
		 * @returns true if timers were set, false if we're in a prerender state, caller should abort on false.
		 */
		setPageLoadTimers: function(ename, t_done, data) {
			var t_resp_start, t_fetch_start, p, navSt;

			if (ename !== "xhr") {
				impl.initFromCookie();
				impl.initFromNavTiming();

				if (impl.checkPreRender()) {
					return false;
				}
			}

			if (ename === "xhr") {
				if (data.timers) {
					// If we were given a list of timers, set those first
					for (var timerName in data.timers) {
						if (data.timers.hasOwnProperty(timerName)) {
							BOOMR.plugins.RT.setTimer(timerName, data.timers[timerName]);
						}
					}
				}
				else if (data && data.timing) {
					// Use details from xhr object to figure out resp latency and page time
					// t_resp will use the cookie if available or fallback to NavTiming.  Use
					// responseEnd (instead of responseStart) since it's not until responseEnd
					// that the browser can consume the data, and responseEnd is the only guarateed
					// timestamp with cross-origin XHRs if ResourceTiming is enabled.
					t_resp_start = data.timing.responseEnd;

					t_fetch_start = data.timing.fetchStart;

					p = BOOMR.getPerformance();

					// if ResourceTiming is available, use its timestamps for t_resp
					var entry = BOOMR.getResourceTiming(data.url);
					if (entry && p) {
						navSt = p.timing.navigationStart;

						// use responseEnd for XHR TTFB (instead of responseStart)
						t_resp_start = Math.round(navSt + entry.responseEnd);

						// get fetch start too
						t_fetch_start = Math.round(navSt + entry.startTime);
					}
				}
			}
			else if (impl.responseStart) {
				// Use NavTiming API to figure out resp latency and page time
				// t_resp will use the cookie if available or fallback to NavTiming
				t_resp_start = impl.responseStart;
			}
			else if (impl.timers.hasOwnProperty("t_page")) {
				// If the dev has already started t_page timer, we can end it now as well
				BOOMR.plugins.RT.endTimer("t_page");
			}
			else if (impl.t_fb_approx) {
				// If we have an approximate first byte time from the cookie, use it
				t_resp_start = impl.t_fb_approx;
			}

			if (t_resp_start) {
				// if we have a fetch start as well, set the specific timestamps instead of from rt.start
				if (t_fetch_start) {
					BOOMR.plugins.RT.setTimer("t_resp", t_fetch_start, t_resp_start);
				}
				else {
					BOOMR.plugins.RT.endTimer("t_resp", t_resp_start);
				}

				if (impl.timers.t_load) {	// t_load is the actual time load completed if using prerender
					BOOMR.plugins.RT.setTimer("t_page", impl.timers.t_load.end - t_resp_start);
				}
				else {
					//
					// Ensure that t_done is after t_resp_start.  If not, set a var so we
					// knew there was an inversion.  This can happen due to bugs in NavTiming
					// clients, where responseEnd happens after all other NavTiming events.
					//
					if (t_done < t_resp_start) {
						BOOMR.addVar("t_page.inv", 1);
					}
					else {
						BOOMR.plugins.RT.setTimer("t_page", t_done - t_resp_start);
					}
				}
			}

			// If a prerender timer was started, we can end it now as well
			if (impl.timers.hasOwnProperty("t_postrender")) {
				BOOMR.plugins.RT.endTimer("t_postrender");
				BOOMR.plugins.RT.endTimer("t_prerender");
			}

			return true;
		},

		/**
		 * Writes a bunch of timestamps onto the beacon that help in request tracing on the server
		 * 	- rt.tstart: The value of t_start that we determined was appropriate
		 *	- rt.cstart: The value of t_start from the cookie if different from rt.tstart
		 *	- rt.bstart: The timestamp when boomerang started
		 *	- rt.blstart:The timestamp when boomerang was added to the host page
		 *	- rt.end:    The timestamp when the t_done timer ended
		 *
		 * @param t_start The value of t_start that we plan to use
		 */
		setSupportingTimestamps: function(t_start) {
			if (t_start) {
				BOOMR.addVar("rt.tstart", t_start);
			}
			if (typeof impl.t_start === "number" && impl.t_start !== t_start) {
				BOOMR.addVar("rt.cstart", impl.t_start);
			}
			BOOMR.addVar("rt.bstart", BOOMR.t_start);
			if (BOOMR.t_lstart) {
				BOOMR.addVar("rt.blstart", BOOMR.t_lstart);
			}
			BOOMR.addVar("rt.end", impl.timers.t_done.end);	// don't just use t_done because dev may have called endTimer before we did
		},

		/**
		 * Determines the best value to use for t_start.
		 * If called from an xhr call, then use the start time for that call
		 * Else, If we have navigation timing, use that
		 * Else, If we have a cookie time, and this isn't the result of a BACK button, use the cookie time
		 * Else, if we have a cached timestamp from an earlier call, use that
		 * Else, give up
		 *
		 * @param ename	The event name that resulted in this call. Special consideration for "xhr"
		 * @param data  Data passed in from the event caller. If the event name is "xhr",
		 *              this should contain the page group name for the xhr call in an attribute called `name`
		 *		and optionally, detailed timing information in a sub-object called `timing`
		 *              and resource information in a sub-object called `resource`
		 *
		 * @returns the determined value of t_start or undefined if unknown
		 */
		determineTStart: function(ename, data) {
			var t_start;
			if (ename === "xhr") {
				if (data && data.name && impl.timers[data.name]) {
					// For xhr timers, t_start is stored in impl.timers.xhr_{page group name}
					// and xhr.pg is set to {page group name}
					t_start = impl.timers[data.name].start;
				}
				else if (data && data.timing && data.timing.requestStart) {
					// For automatically instrumented xhr timers, we have detailed timing information
					t_start = data.timing.requestStart;
				}

				if (typeof t_start === "undefined" && data && BOOMR.utils.inArray(data.initiator, BOOMR.constants.BEACON_TYPE_SPAS)) {
					// if we don't have a start time, set to none so it can possibly be fixed up
					BOOMR.addVar("rt.start", "none");
				}
				else {
					BOOMR.addVar("rt.start", "manual");
				}

				impl.cached_xhr_start = t_start;
			}
			else {
				if (impl.navigationStart) {
					t_start = impl.navigationStart;
				}
				else if (impl.t_start && impl.navigationType !== 2) {
					t_start = impl.t_start;			// 2 is TYPE_BACK_FORWARD but the constant may not be defined across browsers
					BOOMR.addVar("rt.start", "cookie");	// if the user hit the back button, referrer will match, and cookie will match
				}						// but will have time of previous page start, so t_done will be wrong
				else if (impl.cached_t_start) {
					t_start = impl.cached_t_start;
				}
				else {
					BOOMR.addVar("rt.start", "none");
					t_start = undefined;			// force all timers to NaN state
				}

				impl.cached_t_start = t_start;
			}

			BOOMR.debug("Got start time: " + t_start, "rt");
			return t_start;
		},

		page_ready: function() {
			// we need onloadfired because it's possible to reset "impl.complete"
			// if you're measuring multiple xhr loads, but not possible to reset
			// impl.onloadfired
			this.onloadfired = true;
		},

		check_visibility: function() {
			// we care if the page became visible at some point
			if (BOOMR.visibilityState() === "visible") {
				impl.visiblefired = true;
			}
		},

		prerenderToVisible: function() {
			if (impl.onloadfired
				&& impl.autorun) {
				BOOMR.debug("Transitioned from prerender to " + BOOMR.visibilityState(), "rt");

				// note that we transitioned from prerender on the beacon for debugging
				BOOMR.addVar("vis.pre", "1");

				// send a beacon
				BOOMR.plugins.RT.done(null, "visible");
			}
		},

		page_unload: function(edata) {
			BOOMR.debug("Unload called when unloadfired = " + this.unloadfired, "rt");
			if (!this.unloadfired) {
				// run done on abort or on page_unload to measure session length
				BOOMR.plugins.RT.done(edata, "unload");
			}

			// set cookie for next page
			// We use document.URL instead of location.href because of a bug in safari 4
			// where location.href is URL decoded
			this.updateCookie({ "r": d.URL }, edata.type === "beforeunload" ? "ul" : "hd");


			this.unloadfired = true;
		},

		_iterable_click: function(name, element, etarget, value_cb) {
			var value;
			if (!etarget) {
				return;
			}
			BOOMR.debug(name + " called with " + etarget.nodeName, "rt");
			while (etarget && etarget.nodeName.toUpperCase() !== element) {
				etarget = etarget.parentNode;
			}
			if (etarget && etarget.nodeName.toUpperCase() === element) {
				BOOMR.debug("passing through", "rt");

				// user event, they may be going to another page
				// if this page is being opened in a different tab, then
				// our unload handler won't fire, so we need to set our
				// cookie on click or submit
				value = value_cb(etarget);
				this.updateCookie({ "nu": value }, "cl" );
				BOOMR.addVar("nu", BOOMR.utils.cleanupURL(value));
				impl.addedVars.push("nu");
			}
		},

		onclick: function(etarget) {
			impl._iterable_click("Click", "A", etarget, function(t) { return t.href; });
		},

		onerror: function() {
			if (this.onloadfired) {
				// allow error beacons to send outside of page load without adding
				// RT variables to the beacon
				impl.complete = true;
			}
		},

		onsubmit: function(etarget) {
			impl._iterable_click("Submit", "FORM", etarget, function(t) {
				var v = t.getAttribute("action") || d.URL || "";
				return v.match(/\?/) ? v : v + "?";
			});
		},

		domloaded: function() {
			BOOMR.plugins.RT.endTimer("t_domloaded");
		},

		clear: function() {
			BOOMR.removeVar("rt.start");
			if (impl.addedVars && impl.addedVars.length > 0) {
				BOOMR.removeVar(impl.addedVars);
				impl.addedVars = [];
			}
		}
	};

	BOOMR.plugins.RT = {
		// Methods

		init: function(config) {
			BOOMR.debug("init RT", "rt");
			if (w !== BOOMR.window) {
				w = BOOMR.window;
			}

			// protect against undefined window/document
			if (!w || !w.document) {
				return;
			}

			d = w.document;

			BOOMR.utils.pluginConfig(impl, config, "RT",
						["cookie", "cookie_exp", "session_exp", "strict_referrer"]);

			if (config && typeof config.autorun !== "undefined") {
				impl.autorun = config.autorun;
			}

			// A beacon may be fired automatically on page load or if the page dev fires
			// it manually with their own timers.  It may not always contain a referrer
			// (eg: XHR calls).  We set default values for these cases.
			// This is done before reading from the cookie because the cookie overwrites
			// impl.r
			if (typeof d !== "undefined") {
				impl.r = impl.r2 = BOOMR.utils.hashQueryString(d.referrer, true);
			}

			// Now pull out start time information and session information from the cookie
			// We'll do this every time init is called, and every time we call it, it will
			// overwrite values already set (provided there are values to read out)
			impl.initFromCookie();

			// only initialize once.  we still collect config and check/set cookies
			// every time init is called, but we attach event handlers only once
			if (impl.initialized) {
				return this;
			}

			impl.complete = false;
			impl.timers = {};

			impl.check_visibility();

			BOOMR.subscribe("page_ready", impl.page_ready, null, impl);
			BOOMR.subscribe("visibility_changed", impl.check_visibility, null, impl);
			BOOMR.subscribe("prerender_to_visible", impl.prerenderToVisible, null, impl);
			BOOMR.subscribe("page_ready", this.done, "load", this);
			BOOMR.subscribe("xhr_load", this.done, "xhr", this);
			BOOMR.subscribe("dom_loaded", impl.domloaded, null, impl);
			BOOMR.subscribe("page_unload", impl.page_unload, null, impl);
			BOOMR.subscribe("click", impl.onclick, null, impl);
			BOOMR.subscribe("form_submit", impl.onsubmit, null, impl);
			BOOMR.subscribe("before_beacon", this.addTimersToBeacon, "beacon", this);
			BOOMR.subscribe("onbeacon", impl.clear, null, impl);
			BOOMR.subscribe("onerror", impl.onerror, null, impl);

			// Override any getBeaconURL method to make sure we return the one from the
			// cookie and not the one hardcoded into boomerang
			BOOMR.getBeaconURL = function() { return impl.beacon_url; };

			impl.initialized = true;
			return this;
		},

		startTimer: function(timer_name, time_value) {
			if (timer_name) {
				if (timer_name === "t_page") {
					this.endTimer("t_resp", time_value);
				}
				impl.timers[timer_name] = {start: (typeof time_value === "number" ? time_value : BOOMR.now())};
			}

			return this;
		},

		endTimer: function(timer_name, time_value) {
			if (timer_name) {
				impl.timers[timer_name] = impl.timers[timer_name] || {};
				if (impl.timers[timer_name].end === undefined) {
					impl.timers[timer_name].end =
							(typeof time_value === "number" ? time_value : BOOMR.now());
				}
			}

			return this;
		},

		setTimer: function(timer_name, time_delta_or_start, timer_end) {
			if (timer_name) {
				if (typeof timer_end !== "undefined") {
					// in this case, we were given three args, the name, start, and end,
					// so time_delta_or_start is the start time
					impl.timers[timer_name] = {
						start: time_delta_or_start,
						end: timer_end,
						delta: timer_end - time_delta_or_start
					};
				}
				else {
					// in this case, we were just given two args, the name and delta
					impl.timers[timer_name] = { delta: time_delta_or_start };
				}
			}

			return this;
		},

		addTimersToBeacon: function(vars, source) {
			var t_name, timer,
			    t_other = [];

			for (t_name in impl.timers) {
				if (impl.timers.hasOwnProperty(t_name)) {
					timer = impl.timers[t_name];

					// if delta is a number, then it was set using setTimer
					// if not, then we have to calculate it using start & end
					if (typeof timer.delta !== "number") {
						if (typeof timer.start !== "number") {
							timer.start = source === "xhr" ? impl.cached_xhr_start : impl.cached_t_start;
						}
						timer.delta = timer.end - timer.start;
					}

					// If the caller did not set a start time, and if there was no start cookie
					// Or if there was no end time for this timer,
					// then timer.delta will be NaN, in which case we discard it.
					if (isNaN(timer.delta)) {
						continue;
					}

					if (impl.basic_timers.hasOwnProperty(t_name)) {
						BOOMR.addVar(t_name, timer.delta);
						impl.addedVars.push(t_name);
					}
					else {
						t_other.push(t_name + "|" + timer.delta);
					}
				}
			}

			if (t_other.length) {
				BOOMR.addVar("t_other", t_other.join(","));
				impl.addedVars.push("t_other");
			}

			if (source === "beacon") {
				impl.timers = {};
				impl.complete = false;	// reset this state for the next call
			}
		},

		// Called when the page has reached a "usable" state.  This may be when the
		// onload event fires, or it could be at some other moment during/after page
		// load when the page is usable by the user
		done: function(edata, ename) {
			BOOMR.debug("Called done: " + ename, "rt");

			var t_start, t_done, t_now = BOOMR.now(),
			    subresource = false;

			// We may have to rerun if this was a pre-rendered page, so set complete to false, and only set to true when we're done
			impl.complete = false;

			t_done = impl.validateLoadTimestamp(t_now, edata, ename);

			if (ename === "load" || ename === "visible" || ename === "xhr") {
				if (!impl.setPageLoadTimers(ename, t_done, edata)) {
					return this;
				}
			}

			if (ename === "load" ||
			    ename === "visible" ||
				(ename === "xhr" && edata && BOOMR.utils.inArray(edata.initiator, BOOMR.constants.BEACON_TYPE_SPAS))) {
				// Only add Boomerang timings to page load and SPA beacons
				impl.getBoomerangTimings();
			}

			t_start = impl.determineTStart(ename, edata);

			// If the dev has already called endTimer, then this call will do nothing
			// else, it will stop the page load timer
			this.endTimer("t_done", t_done);

			// For XHR events, ensure t_done is set with the proper start, end, and
			// delta timestamps.  Until Issue #195 is fixed, if this XHR is firing
			// a beacon very quickly after a previous XHR, the previous XHR might
			// not yet have had time to fire a beacon and clear its own t_done,
			// so the preceeding endTimer() wouldn't have set this XHR's timestamps.
			if (edata && edata.initiator === "xhr") {
				this.setTimer("t_done", edata.timing.requestStart, edata.timing.loadEventEnd);
			}

			// make sure old variables don't stick around
			BOOMR.removeVar(
				"t_done", "t_page", "t_resp", "t_postrender", "t_prerender", "t_load", "t_other",
				"r", "r2", "rt.tstart", "rt.cstart", "rt.bstart", "rt.end", "rt.subres", "rt.abld",
				"http.errno", "http.method", "xhr.sync"
			);

			impl.setSupportingTimestamps(t_start);

			this.addTimersToBeacon(null, ename);

			BOOMR.addVar("r", BOOMR.utils.cleanupURL(impl.r));

			if (impl.r2 !== impl.r) {
				BOOMR.addVar("r2", BOOMR.utils.cleanupURL(impl.r2));
			}

			if (ename === "xhr" && edata) {
				if (edata && edata.data) {
					edata = edata.data;
				}
			}

			if (ename === "xhr" && edata) {
				subresource = edata.subresource;

				if (edata.url) {
					BOOMR.addVar("u", BOOMR.utils.cleanupURL(edata.url.replace(/#.*/, "")));
					impl.addedVars.push("u");
				}

				if (edata.status && (edata.status < -1 || edata.status >= 400)) {
					BOOMR.addVar("http.errno", edata.status);
				}

				if (edata.method && edata.method !== "GET") {
					BOOMR.addVar("http.method", edata.method);
				}

				if (edata.headers) {
					BOOMR.addVar("http.hdr", edata.headers);
				}

				if (edata.synchronous) {
					BOOMR.addVar("xhr.sync", 1);
				}

				if (edata.initiator) {
					BOOMR.addVar("http.initiator", edata.initiator);
				}

				impl.addedVars.push("http.errno", "http.method", "http.hdr", "xhr.sync", "http.initiator");
			}

			// This is an explicit subresource
			if (subresource && subresource !== "passive") {
				BOOMR.addVar("rt.subres", 1);
				impl.addedVars.push("rt.subres");
			}

			impl.updateCookie();

			if (ename === "unload") {
				BOOMR.addVar("rt.quit", "");

				if (!impl.onloadfired) {
					BOOMR.addVar("rt.abld", "");
				}

				if (!impl.visiblefired) {
					BOOMR.addVar("rt.ntvu", "");
				}
			}

			impl.complete = true;

			BOOMR.sendBeacon();

			return this;
		},

		is_complete: function() { return impl.complete; },

		updateCookie: function() {
			impl.updateCookie();
		},

		navigationStart: function() {
			if (!impl.navigationStart) {
				impl.initFromNavTiming();
			}
			return impl.navigationStart;
		}
	};

}(window));
// End of RT plugin

/*
 * Copyright (c), Buddy Brewer.
 */

/**
\file navtiming.js
Plugin to collect metrics from the W3C Navigation Timing API. For more information about Navigation Timing,
see: http://www.w3.org/TR/navigation-timing/
*/

(function() {

	// First make sure BOOMR is actually defined.  It's possible that your plugin is loaded before boomerang, in which case
	// you'll need this.
	
	
	if (BOOMR.plugins.NavigationTiming) {
		return;
	}

	// A private object to encapsulate all your implementation details
	var impl = {
		complete: false,
		sendBeacon: function() {
			this.complete = true;
			BOOMR.sendBeacon();
		},
		xhr_done: function(edata) {
			var p;

			if (edata && edata.initiator === "spa_hard") {
				// Single Page App - Hard refresh: Send page's NavigationTiming data, if
				// available.
				impl.done(edata);
				return;
			}
			else if (edata && edata.initiator === "spa") {
				// Single Page App - Soft refresh: The original hard navigation is no longer
				// relevant for this soft refresh, nor is the "URL" for this page, so don't
				// add NavigationTiming or ResourceTiming metrics.
				impl.sendBeacon();
				return;
			}

			var w = BOOMR.window, res, data = {}, k;

			if (!edata) {
				return;
			}

			if (edata.data) {
				edata = edata.data;
			}

			p = BOOMR.getPerformance();
			if (edata.url && p) {
				res = BOOMR.getResourceTiming(edata.url, function(a, b) { return a.responseEnd - b.responseEnd; });
				if (res) {
					data = {
						nt_red_st: res.redirectStart,
						nt_red_end: res.redirectEnd,
						nt_fet_st: res.fetchStart,
						nt_dns_st: res.domainLookupStart,
						nt_dns_end: res.domainLookupEnd,
						nt_con_st: res.connectStart,
						nt_con_end: res.connectEnd,
						nt_req_st: res.requestStart,
						nt_res_st: res.responseStart,
						nt_res_end: res.responseEnd
					};
					if (res.secureConnectionStart) {
						// secureConnectionStart is OPTIONAL in the spec
						data.nt_ssl_st = res.secureConnectionStart;
					}

					for (k in data) {
						if (data.hasOwnProperty(k) && data[k]) {
							data[k] += p.timing.navigationStart;

							// don't need to send microseconds
							data[k] = Math.round(data[k]);
						}
					}

				}
			}

			if (edata.timing) {
				res = edata.timing;
				if (!data.nt_req_st) {
					// requestStart will be 0 if Timing-Allow-Origin header isn't set on the xhr response
					data.nt_req_st = res.requestStart;
				}
				if (!data.nt_res_st) {
					// responseStart will be 0 if Timing-Allow-Origin header isn't set on the xhr response
					data.nt_res_st = res.responseStart;
				}
				if (!data.nt_res_end) {
					data.nt_res_end = res.responseEnd;
				}
				data.nt_domint = res.domInteractive;
				data.nt_domcomp = res.domComplete;
				data.nt_load_st = res.loadEventEnd;
				data.nt_load_end = res.loadEventEnd;
			}

			for (k in data) {
				if (data.hasOwnProperty(k) && !data[k]) {
					delete data[k];
				}
			}

			BOOMR.addVar(data);

			try { impl.addedVars.push.apply(impl.addedVars, Object.keys(data)); }
			catch (ignore) { /* empty */ }

			impl.sendBeacon();
		},

		done: function() {
			var w = BOOMR.window, p, pn, pt, data;
			if (this.complete) {
				return this;
			}

			impl.addedVars = [];

			p = BOOMR.getPerformance();
			if (p && p.timing && p.navigation) {
				BOOMR.info("This user agent supports NavigationTiming.", "nt");
				pn = p.navigation;
				pt = p.timing;
				data = {
					nt_red_cnt: pn.redirectCount,
					nt_nav_type: pn.type,
					nt_nav_st: pt.navigationStart,
					nt_red_st: pt.redirectStart,
					nt_red_end: pt.redirectEnd,
					nt_fet_st: pt.fetchStart,
					nt_dns_st: pt.domainLookupStart,
					nt_dns_end: pt.domainLookupEnd,
					nt_con_st: pt.connectStart,
					nt_con_end: pt.connectEnd,
					nt_req_st: pt.requestStart,
					nt_res_st: pt.responseStart,
					nt_res_end: pt.responseEnd,
					nt_domloading: pt.domLoading,
					nt_domint: pt.domInteractive,
					nt_domcontloaded_st: pt.domContentLoadedEventStart,
					nt_domcontloaded_end: pt.domContentLoadedEventEnd,
					nt_domcomp: pt.domComplete,
					nt_load_st: pt.loadEventStart,
					nt_load_end: pt.loadEventEnd,
					nt_unload_st: pt.unloadEventStart,
					nt_unload_end: pt.unloadEventEnd
				};
				if (pt.secureConnectionStart) {
					// secureConnectionStart is OPTIONAL in the spec
					data.nt_ssl_st = pt.secureConnectionStart;
				}
				if (pt.msFirstPaint) {
					// msFirstPaint is IE9+ http://msdn.microsoft.com/en-us/library/ff974719
					data.nt_first_paint = pt.msFirstPaint;
				}

				BOOMR.addVar(data);

				try { impl.addedVars.push.apply(impl.addedVars, Object.keys(data)); }
				catch (ignore) { /* empty */ }
			}

			// XXX Inconsistency warning.  msFirstPaint above is in milliseconds while
			//     firstPaintTime below is in seconds.microseconds.  The server needs to deal with this.

			// This is Chrome only, so will not overwrite nt_first_paint above
			if (w.chrome && w.chrome.loadTimes) {
				pt = w.chrome.loadTimes();
				if (pt) {
					data = {
						nt_spdy: (pt.wasFetchedViaSpdy ? 1 : 0),
						nt_cinf: pt.connectionInfo,
						nt_first_paint: pt.firstPaintTime
					};

					BOOMR.addVar(data);

					try { impl.addedVars.push.apply(impl.addedVars, Object.keys(data)); }
					catch (ignore) { /* empty */ }
				}
			}

			impl.sendBeacon();
		},

		clear: function() {
			if (impl.addedVars && impl.addedVars.length > 0) {
				BOOMR.removeVar(impl.addedVars);
				impl.addedVars = [];
			}
			this.complete = false;
		},

		prerenderToVisible: function() {
			// ensure we add our data to the beacon even if we had added it
			// during prerender (in case another beacon went out in between)
			this.complete = false;

			// add our data to the beacon
			this.done();
		}
	};

	BOOMR.plugins.NavigationTiming = {
		init: function() {
			if (!impl.initialized) {
				// we'll fire on whichever happens first
				BOOMR.subscribe("page_ready", impl.done, null, impl);
				BOOMR.subscribe("prerender_to_visible", impl.prerenderToVisible, null, impl);
				BOOMR.subscribe("xhr_load", impl.xhr_done, null, impl);
				BOOMR.subscribe("before_unload", impl.done, null, impl);
				BOOMR.subscribe("onbeacon", impl.clear, null, impl);

				impl.initialized = true;
			}
			return this;
		},

		is_complete: function() {
			return true;
		}
	};

}());

/**
\file clicks.js
A plugin beaconing clicked elements back to the server
*/

// w is the window object
(function(w) {

	var d = w.document;

	// First make sure BOOMR is actually defined.  It's possible that your plugin is
	// loaded before boomerang, in which case you'll need this.
	
	

	// A private object to encapsulate all your implementation details
	// This is optional, but the way we recommend you do it.
	var impl = {
		start_time: "",
		click_url: "",
		onbeforeunload: false,
		retention: [],
		handleEvent: function(event) {
			if (typeof impl.click_url === "undefined" ) {
				BOOMR.error("No Beacon URL defined will not send beacon");
				return;
			}

			var target = null;
			if (event.target) { target = event.target; }
			else if (event.srcElement) { target = event.srcElement; }
			var document_res = impl.getDocumentSize();
			var viewport = impl.getViewport();
			var data = {
				element: target.nodeName,
				id: target.id,
				"class": target.classList,
				x: event.x,
				y: event.y,
				document_height: document_res.height,
				document_width: document_res.width,
				viewport_height: viewport.height,
				viewport_width: viewport.width
			};

			if (typeof impl.onbeforeunload === "undefined" || impl.onbeforeunload === false ) {
				BOOMR.info("No preference set for when to send clickstats, will default to send immediately");
				impl.sendData(data);
			}
			else {
				impl.retention.push(data);
			}
		},
		sendData: function(data) {
			var keys = Object.keys(data);
			var urlenc = "";
			for (var i in keys) {
				urlenc += keys[i] + "=" + data[keys[i]] + "&";
			}
			BOOMR.info("Url-encoded string: " + urlenc);
			var url = impl.click_url + "?" + urlenc;
			var img = new Image();
			img.src = url;
			img.remove();
		},
		unload: function() {
			impl.retention.forEach(function(data){
				impl.sendData(data);
			});
		},
		getDocumentSize: function() {
			return {
				height: Math.max(
					d.body.scrollHeight, d.documentElement.scrollHeight,
					d.body.offsetHeight, d.documentElement.offsetHeight,
					d.body.clientHeight, d.documentElement.clientHeight
				),
				width: Math.max(
					d.body.scrollWidth, d.documentElement.scrollWidth,
					d.body.offsetWidth, d.documentElement.offsetWidth,
					d.body.clientWidth, d.documentElement.clientWidth
				)
			};
		},
		getViewport: function() {

			var viewPortWidth;
			var viewPortHeight;

			// the more standards compliant browsers (mozilla/netscape/opera/IE7)
			// use window.innerWidth and window.innerHeight
			if (typeof window.innerWidth !== "undefined") {
				viewPortWidth = window.innerWidth;
				viewPortHeight = window.innerHeight;
			}

			// IE6 in standards compliant mode (i.e. with a valid doctype as the
			// first line in the document)
			else if (typeof document.documentElement !== "undefined"
				&& typeof document.documentElement.clientWidth !== "undefined"
				&& document.documentElement.clientWidth !== 0) {
				viewPortWidth = document.documentElement.clientWidth;
				viewPortHeight = document.documentElement.clientHeight;
			}

			// older versions of IE
			else {
				viewPortWidth = document.getElementsByTagName("body")[0].clientWidth;
				viewPortHeight = document.getElementsByTagName("body")[0].clientHeight;
			}
			return {width: viewPortWidth, height: viewPortHeight};
		}
	};

	BOOMR.plugins.clicks = {
		init: function(config) {
			var properties = ["click_url",	  // URL to beacon
					 "onbeforeunload"]; // Send the beacon when page is closed?

			// This block is only needed if you actually have user configurable properties
			BOOMR.utils.pluginConfig(impl, config, "clicks", properties);

			// Other initialisation code here
			w.addEventListener("click", impl.handleEvent, true);
			w.addEventListener("beforeunload", impl.unload, true);
			return this;
		},

		// Any other public methods would be defined here

		is_complete: function() {
			// This method should determine if the plugin has completed doing what it
			/// needs to do and return true if so or false otherwise
			impl.start_time = Date.now();
			return true;
		}
	};

}(window));

/**
\file mobile.js
Plugin to capture navigator.connection.type on browsers that support it
*/

(function() {
	var connection;

	if (typeof navigator === "object") {
		connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || navigator.msConnection;
	}

	if (!connection) {
		return;
	}
	BOOMR.addVar("mob.ct", connection.type);
	BOOMR.addVar("mob.bw", connection.bandwidth);
	BOOMR.addVar("mob.mt", connection.metered);

}());

/*
 * Copyright (c), Log-Normal, Inc.
 */

/**
\file memory.js
Plugin to collect memory metrics when available.
see: http://code.google.com/p/chromium/issues/detail?id=43281
*/

(function() {
	var w, p = {}, d, m, s, n, b, impl;
	// First make sure BOOMR is actually defined.  It's possible that your plugin is loaded before boomerang, in which case
	// you'll need this.
	
	
	if (BOOMR.plugins.Memory) {
		return;
	}

	function nodeCount(type, keys, filter) {
		var tags, r, o;
		try {
			tags = d.getElementsByTagName(type);
			r = tags.length;

			if (keys && keys.length) {
				o = {};
				o[keys[0]] = r;

				if (typeof filter === "function") {
					try {
						tags = BOOMR.utils.arrayFilter(tags, filter);
						if (tags.length !== r) {
							if (keys.length > 1) {
								o[keys[1]] = tags.length;
							}
							else {
								r += "/" + tags.length;
							}
						}
					}
					catch (err) {
						BOOMR.addError(err, "Memory.nodeList." + type + ".filter");
					}
				}

			}
			return o || r;
		}
		catch (err) {
			BOOMR.addError(err, "Memory.nodeList." + type);
			return 0;
		}
	}

	function errorWrap(condition, callback, component) {
		if (condition) {
			try {
				callback();
			}
			catch (err) {
				BOOMR.addError(err, "Memory.done." + component);
			}
		}
	}

	// A private object to encapsulate all your implementation details
	impl = {
		done: function() {
			if (!w) {
				return;		// this can happen for an unload beacon
			}

			// If we have resource timing, get number of resources
			BOOMR.removeVar("dom.res");
			errorWrap(true,
				function() {
					var res, doms = {}, a;

					if (!p || typeof p.getEntriesByType !== "function") {
						return;
					}

					res = p.getEntriesByType("resource");
					if (!res || !res.length) {
						return;
					}

					BOOMR.addVar("dom.res", res.length);

					a = BOOMR.window.document.createElement("a");

					[].forEach.call(res, function(r) {
						a.href = r.name;
						doms[a.hostname] = true;
					});

					BOOMR.addVar("dom.doms", Object.keys(doms).length);
				},
				"resources"
			);

			if (m) {
				BOOMR.addVar({
					"mem.total": m.totalJSHeapSize,
					"mem.limit": m.jsHeapSizeLimit,
					"mem.used": m.usedJSHeapSize
				});
			}

			errorWrap(s,
				function() {
					BOOMR.addVar({
						"scr.xy": s.width + "x" + s.height,
						"scr.bpp": s.colorDepth + "/" + (s.pixelDepth || "")
					});
					if (s.orientation) {
						BOOMR.addVar("scr.orn", s.orientation.angle + "/" + s.orientation.type);
					}
					if (w.devicePixelRatio > 1) {
						BOOMR.addVar("scr.dpx", w.devicePixelRatio);
					}
					if (w.scrollX !== 0 || w.scrollY !== 0) {
						BOOMR.addVar("scr.sxy", w.scrollX + "x" + w.scrollY);
					}
				},
				"screen"
			);

			errorWrap(n,
				function() {
					if (n.hardwareConcurrency) {
						BOOMR.addVar("cpu.cnc", n.hardwareConcurrency);
					}
					if (n.maxTouchPoints) {
						BOOMR.addVar("scr.mtp", n.maxTouchPoints);
					}
				},
				"navigator"
			);

			errorWrap(b,
				function() {
					BOOMR.addVar("bat.lvl", b.level);
				},
				"battery"
			);

			errorWrap(true,
				function() {
					BOOMR.addVar({
						"dom.ln": nodeCount("*"),
						"dom.sz": d.documentElement.innerHTML.length
					});

					BOOMR.addVar(nodeCount(
						"img",
						["dom.img", "dom.img.ext"],
						function(el) { return el.src && !el.src.match(/^(?:about:|javascript:|data:|#)/); })
					);

					BOOMR.addVar(nodeCount(
						"script",
						["dom.script", "dom.script.ext"],
						function(el) { return el.src && !el.src.match(/^(?:about:|javascript:|#)/); })
					);
				},
				"dom"
			);

			// no need of sendBeacon because we're called when the beacon is being sent
		}
	};

	BOOMR.plugins.Memory = {
		init: function() {
			var c;

			try {
				w = BOOMR.window;
				d = w.document;
				p = BOOMR.getPerformance();
				c = w.console;
				s = w.screen;
				n = w.navigator;
				if (n && n.battery) {
					b = n.battery;
				}
				else if (n && n.getBattery) {
					var batPromise = n.getBattery();

					// some UAs implement getBattery without a promise
					if (batPromise && typeof batPromise.then === "function") {
						batPromise.then(function(battery) {
							b = battery;
						});
					}
					else {
						BOOMR.addError("getBattery promise is not a function: " + JSON.stringify(batPromise), "Memory.init");
					}
				}
			}
			catch (err) {
				BOOMR.addError(err, "Memory.init");
			}

			m = (p && p.memory ? p.memory : (c && c.memory ? c.memory : null));

			if (impl.initialized) {
				return this;
			}

			impl.initialized = true;

			// we do this before sending a beacon to get the snapshot when the beacon is sent
			BOOMR.subscribe("before_beacon", impl.done, null, impl);
			return this;
		},

		is_complete: function() {
			// Always true since we run on before_beacon, which happens after the check
			return true;
		}
	};

}());

/**
 * \file cache-reload.js
 * Plugin that forces a cache reload of boomerang (assuming you have server side support)
 * Copyright (c) 2013, SOASTA, Inc. All rights reserved.
 */


(function() {

	
	
	if (BOOMR.plugins.CACHE_RELOAD) {
		return;
	}

	var impl = {
		url: ""
	};

	BOOMR.plugins.CACHE_RELOAD = {
		init: function(config) {
			BOOMR.utils.pluginConfig(impl, config, "CACHE_RELOAD", ["url"]);

			if (!impl.url) {
				return this;
			}

			// we use document and not BOOMR.window.document since
			// we can run inside the boomerang iframe if any
			var i = document.createElement("iframe");
			i.style.display = "none";
			i.src = impl.url;
			document.body.appendChild(i);

			return this;
		},

		is_complete: function() {
			// we always return true since this plugin never adds anything to the beacon
			return true;
		}
	};

}());

(function() {
	
	if (BOOMR.utils && BOOMR.utils.Compression) {
		return;
	}

	var self = BOOMR.utils.Compression = {};

	/**
	 * Converts the structure to URL-friendly JSON
	 * Adapted from https://github.com/Sage/jsurl
	 * Changes:
	 *  Formatting
	 *  Removal of Array.map and Object.map for compat with IE 6-8
	 *  Change of str[i] syntax to str.charAt(i) for compat with IE 6-7
	 *
	 * @param {object} v Object to convert
	 *
	 * @returns {string} URL-friendly JSON
	 */
	self.jsUrl = function jsUrl(v) {
		/**
		 * Encodes the specified string
		 *
		 * @param {string} s String
		 *
		 * @returns {string} Encoded string
		 */
		function encode(s) {
			if (!/[^\w-.]/.test(s)) {
				// if the string is only made up of alpha-numeric, underscore,
				// dash or period, we can use it directly.
				return s;
			}

			// we need to escape other characters
			s = s.replace(/[^\w-.]/g, function(ch) {
				if (ch === "$") {
					return "!";
				}

				// use the character code for this one
				ch = ch.charCodeAt(0);

				if (ch < 0x100) {
					// if less than 256, use "*[2-char code]"
					return "*" + ("00" + ch.toString(16)).slice(-2);
				}
				else {
					// use "**[4-char code]"
					return "**" + ("0000" + ch.toString(16)).slice(-4);
				}
			});

			return s;
		}

		var tmpAry = [];

		switch (typeof v) {
		case "number":
			// for finite numbers, return "~[number]"
			return isFinite(v) ? "~" + v : "~null";

		case "string":
			// "~'[encoded string]"
			return "~'" + encode(v);

		case "boolean":
			// "~true" or "~false"
			return "~" + v;

		case "object":
			if (!v) {
				return "~null";
			}

			if (Array.isArray(v)) {
				// iterate instead of Array.map for compat
				for (var i = 0; i < v.length; i++) {
					if (i in v) {
						tmpAry[i] = self.jsUrl(v[i]) || "~null";
					}
				}

				return "~(" + (tmpAry.join("") || "~") + ")";
			}
			else {
				// iterate instead of Object.map for compat
				for (var key in v) {
					if (v.hasOwnProperty(key)) {
						var val = self.jsUrl(v[key]);
						// skip undefined and functions

						if (val) {
							tmpAry.push(encode(key) + val);
						}
					}
				}

				return "~(" + tmpAry.sort().join("~") + ")";
			}

		default:
			// function, undefined
			return undefined;
		}
	};

	/* BEGIN_DEBUG */
	/**
	 * JSURL reserved value map
	 */
	var JSURL_RESERVED = {
		"true": true,
		"false": false,
		"null": null
	};

	/**
	 * Converts from JSURL to JSON
	 * Adapted from https://github.com/Sage/jsurl
	 *
	 * @param {string} s JSURL string
	 *
	 * @returns {object} Decompressed object
	 */
	self.jsUrlDecompress = function(s) {
		if (typeof s !== "string") {
			return s;
		}

		var i = 0;
		var len = s.length;

		/**
		 * Eats the specified character, and throws an exception if another character
		 * was found
		 *
		 * @param {string} expected Expected string
		 */
		function eat(expected) {
			if (s.charAt(i) !== expected) {
				throw new Error("bad JSURL syntax: expected " + expected + ", got " + (s && s.charAt(i))
					+ " from:" + s
					+ " length:" + s.length.toString()
					+ " char at:" + s.charAt(i));
			}

			i++;
		}

		/**
		 * Decodes the next value
		 *
		 * @returns {string} Next value
		 */
		function decode() {
			var beg = i;
			var ch;
			var r = "";

			// iterate until we reach the end of the string or "~" or ")"
			while (i < len && (ch = s.charAt(i)) !== "~" && ch !== ")") {
				switch (ch) {
				case "*":
					if (beg < i) {
						r += s.substring(beg, i);
					}

					if (s.charAt(i + 1) === "*") {
						// Unicode characters > 0xff (255), which are encoded as "**[4-digit code]"
						r += String.fromCharCode(parseInt(s.substring(i + 2, i + 6), 16));
						beg = (i += 6);
					}
					else {
						// Unicode characters <= 0xff (255), which are encoded as "*[2-digit code]"
						r += String.fromCharCode(parseInt(s.substring(i + 1, i + 3), 16));
						beg = (i += 3);
					}
					break;

				case "!":
					if (beg < i) {
						r += s.substring(beg, i);
					}

					r += "$";
					beg = ++i;
					break;

				default:
					i++;
				}
			}

			return r + s.substring(beg, i);
		}

		return (function parseOne() {
			var result, ch, beg;

			eat("~");

			switch (ch = s.charAt(i)) {
			case "(":
				i++;
				if (s.charAt(i) === "~") {
					// this is an Array
					result = [];

					if (s.charAt(i + 1) === ")") {
						i++;
					}
					else {
						do {
							result.push(parseOne());
						} while (s.charAt(i) === "~");
					}
				}
				else {
					// this is an object
					result = {};

					if (s.charAt(i) !== ")") {
						do {
							var key = decode();
							result[key] = parseOne();
						} while (s.charAt(i) === "~" && ++i);
					}
				}
				eat(")");
				break;

			case "'":
				i++;
				result = decode();
				break;

			default:
				beg = i++;
				while (i < len && /[^)~]/.test(s.charAt(i))) {
					i++;
				}

				var sub = s.substring(beg, i);

				if (/[\d\-]/.test(ch)) {
					result = parseFloat(sub);
				}
				else {
					result = JSURL_RESERVED[sub];

					if (typeof result === "undefined") {
						throw new Error("bad value keyword: " + sub);
					}
				}
			}

			return result;
		}());
	};
	/* END_DEBUG */
}());

/*eslint-disable*/

//
// Via https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/isArray
//
// polyfill for Array.isArray
if (!Array.isArray) {
	Array.isArray = function(arg) {
		return Object.prototype.toString.call(arg) === '[object Array]';
	};
}

//
// Via https://github.com/stacktracejs/error-stack-parser
// Modifications:
// * Removed UMD
// * Return anonymous objects, not StackFrames
//
(function (root, factory) {
	'use strict';
	root.ErrorStackParser = factory();
}(this, function ErrorStackParser() {
	'use strict';

	var FIREFOX_SAFARI_STACK_REGEXP = /(^|@)\S+\:\d+/;
	var CHROME_IE_STACK_REGEXP = /^\s*at .*(\S+\:\d+|\(native\))/m;
	var SAFARI_NATIVE_CODE_REGEXP = /^(eval@)?(\[native code\])?$/;

	function _map(array, fn, thisArg) {
		if (typeof Array.prototype.map === 'function') {
			return array.map(fn, thisArg);
		} else {
			var output = new Array(array.length);
			for (var i = 0; i < array.length; i++) {
				output[i] = fn.call(thisArg, array[i]);
			}
			return output;
		}
	}

	function _filter(array, fn, thisArg) {
		if (typeof Array.prototype.filter === 'function') {
			return array.filter(fn, thisArg);
		} else {
			var output = [];
			for (var i = 0; i < array.length; i++) {
				if (fn.call(thisArg, array[i])) {
					output.push(array[i]);
				}
			}
			return output;
		}
	}

	return {
		/**
		 * Given an Error object, extract the most information from it.
		 * @param error {Error}
		 * @return Array[]
		 */
		parse: function ErrorStackParser$$parse(error) {
			if (typeof error.stacktrace !== 'undefined' || typeof error['opera#sourceloc'] !== 'undefined') {
				return this.parseOpera(error);
			} else if (error.stack && error.stack.match(CHROME_IE_STACK_REGEXP)) {
				return this.parseV8OrIE(error);
			} else if (error.stack) {
				return this.parseFFOrSafari(error);
			} else {
				throw new Error('Cannot parse given Error object');
			}
		},

		/**
		 * Separate line and column numbers from a URL-like string.
		 * @param urlLike String
		 * @return Array[String]
		 */
		extractLocation: function ErrorStackParser$$extractLocation(urlLike) {
			// Fail-fast but return locations like "(native)"
			if (urlLike.indexOf(':') === -1) {
				return [urlLike];
			}

			var locationParts = urlLike.replace(/[\(\)\s]/g, '').split(':');
			var lastNumber = locationParts.pop();
			var possibleNumber = locationParts[locationParts.length - 1];
			if (!isNaN(parseFloat(possibleNumber)) && isFinite(possibleNumber)) {
				var lineNumber = locationParts.pop();
				return [locationParts.join(':'), lineNumber, lastNumber];
			} else {
				return [locationParts.join(':'), lastNumber, undefined];
			}
		},

		parseV8OrIE: function ErrorStackParser$$parseV8OrIE(error) {
			var filtered = _filter(error.stack.split('\n'), function (line) {
				return !!line.match(CHROME_IE_STACK_REGEXP);
			}, this);

			return _map(filtered, function (line) {
				if (line.indexOf('(eval ') > -1) {
					// Throw away eval information until we implement stacktrace.js/stackframe#8
					line = line.replace(/eval code/g, 'eval').replace(/(\(eval at [^\()]*)|(\)\,.*$)/g, '');
				}
				var tokens = line.replace(/^\s+/, '').replace(/\(eval code/g, '(').split(/\s+/).slice(1);
				var locationParts = this.extractLocation(tokens.pop());
				var functionName = tokens.join(' ') || undefined;
				var fileName = locationParts[0] === 'eval' ? undefined : locationParts[0];

				return {
					functionName: functionName,
					fileName: fileName,
					lineNumber: locationParts[1],
					columnNumber: locationParts[2],
					source: line
				};
			}, this);
		},

		parseFFOrSafari: function ErrorStackParser$$parseFFOrSafari(error) {
			var filtered = _filter(error.stack.split('\n'), function (line) {
				return !line.match(SAFARI_NATIVE_CODE_REGEXP);
			}, this);

			return _map(filtered, function (line) {
				// Throw away eval information until we implement stacktrace.js/stackframe#8
				if (line.indexOf(' > eval') > -1) {
					line = line.replace(/ line (\d+)(?: > eval line \d+)* > eval\:\d+\:\d+/g, ':$1');
				}

				if (line.indexOf('@') === -1 && line.indexOf(':') === -1) {
					// Safari eval frames only have function names and nothing else
					return { functionName: line };
				} else {
					var tokens = line.split('@');
					var locationParts = this.extractLocation(tokens.pop());
					var functionName = tokens.join('@') || undefined;
					return {
						functionName: functionName,
						fileName: locationParts[0],
						lineNumber: locationParts[1],
						columnNumber: locationParts[2],
						source: line
					};
				}
			}, this);
		},

		parseOpera: function ErrorStackParser$$parseOpera(e) {
			if (!e.stacktrace || (e.message.indexOf('\n') > -1 &&
				e.message.split('\n').length > e.stacktrace.split('\n').length)) {
				return this.parseOpera9(e);
			} else if (!e.stack) {
				return this.parseOpera10(e);
			} else {
				return this.parseOpera11(e);
			}
		},

		parseOpera9: function ErrorStackParser$$parseOpera9(e) {
			var lineRE = /Line (\d+).*script (?:in )?(\S+)/i;
			var lines = e.message.split('\n');
			var result = [];

			for (var i = 2, len = lines.length; i < len; i += 2) {
				var match = lineRE.exec(lines[i]);
				if (match) {
					result.push({
						fileName: match[2],
						lineNumber: match[1],
						source: lines[i]
					});
				}
			}

			return result;
		},

		parseOpera10: function ErrorStackParser$$parseOpera10(e) {
			var lineRE = /Line (\d+).*script (?:in )?(\S+)(?:: In function (\S+))?$/i;
			var lines = e.stacktrace.split('\n');
			var result = [];

			for (var i = 0, len = lines.length; i < len; i += 2) {
				var match = lineRE.exec(lines[i]);
				if (match) {
					result.push({
						functionName: match[3] || undefined,
						fileName: match[2],
						lineNumber: match[1],
						source: lines[i]
					});
				}
			}

			return result;
		},

		// Opera 10.65+ Error.stack very similar to FF/Safari
		parseOpera11: function ErrorStackParser$$parseOpera11(error) {
			var filtered = _filter(error.stack.split('\n'), function (line) {
				return !!line.match(FIREFOX_SAFARI_STACK_REGEXP) &&
					!line.match(/^Error created at/);
			}, this);

			return _map(filtered, function (line) {
				var tokens = line.split('@');
				var locationParts = this.extractLocation(tokens.pop());
				var functionCall = (tokens.shift() || '');
				var functionName = functionCall
						.replace(/<anonymous function(: (\w+))?>/, '$2')
						.replace(/\([^\)]*\)/g, '') || undefined;
				var argsRaw;
				if (functionCall.match(/\(([^\)]*)\)/)) {
					argsRaw = functionCall.replace(/^[^\(]+\(([^\)]*)\)$/, '$1');
				}
				var args = (argsRaw === undefined || argsRaw === '[arguments not available]') ? undefined : argsRaw.split(',');
				return {
					functionName: functionName,
					args: args,
					fileName: locationParts[0],
					lineNumber: locationParts[1],
					columnNumber: locationParts[2],
					source: line
				};
			}, this);
		}
	};
}));
/*eslint-enable*/

/**
 * Boomerang Error plugin
 */
(function() {
	var impl;

	
	

	if (BOOMR.plugins.Errors) {
		return;
	}

	//
	// Constants
	//

	// functions to strip
	var STACK_FUNCTIONS_REMOVE = [
		"BOOMR_addError",
		"BOOMR_plugins_errors_wrap"
	];

	/**
	 * Maximum size, in characters, of stack to capture
	 */
	var MAX_STACK_SIZE = 5000;

	/**
	 * BoomerangError object
	 *
	 * @param {object} config Configuration
	 */
	function BoomerangError(config) {
		config = config || {};

		// how many times we've seen this error
		if (typeof config.count === "number" || typeof config.count === "string") {
			this.count = parseInt(config.count, 10);
		}
		else {
			this.count = 1;
		}

		if (typeof config.timestamp === "number") {
			this.timestamp = config.timestamp;
		}
		else {
			 this.timestamp = BOOMR.now();
		}

		// merge in properties from config
		if (typeof config.code === "number" || typeof config.code === "string") {
			this.code = parseInt(config.code, 10);
		}

		if (typeof config.message === "string") {
			this.message = config.message;
		}

		if (typeof config.functionName === "string") {
			this.functionName = config.functionName;
		}

		if (typeof config.fileName === "string") {
			this.fileName = config.fileName;
		}

		if (typeof config.lineNumber === "number" || typeof config.lineNumber === "string") {
			this.lineNumber = parseInt(config.lineNumber, 10);
		}

		if (typeof config.columnNumber === "number" || typeof config.columnNumber === "string") {
			this.columnNumber = parseInt(config.columnNumber, 10);
		}

		if (typeof config.stack === "string") {
			this.stack = config.stack;
		}

		if (typeof config.type === "string") {
			this.type = config.type;
		}

		if (typeof config.extra !== "undefined") {
			this.extra = config.extra;
		}

		this.source = (typeof config.source === "number" || typeof config.source === "string") ?
			parseInt(config.source, 10) :
			BOOMR.plugins.Errors.SOURCE_APP;

		if (typeof config.via === "number" || typeof config.via === "string") {
			this.via = parseInt(config.via, 10);
		}

		if (Array.isArray(config.frames)) {
			this.frames = config.frames;
		}
		else {
			this.frames = [];
		}

		if (Array.isArray(config.events)) {
			this.events = config.events;
		}
		else {
			this.events = [];
		}
	}

	/**
	 * Determines if one BoomerangError object is equal to another
	 *
	 * @param {object} other Object to compare to
	 *
	 * @returns {boolean} True if the two objects are logically equal errors
	 */
	BoomerangError.prototype.equals = function(other) {
		if (typeof other !== "object") {
			return false;
		}
		else if (this.code !== other.code) {
			return false;
		}
		else if (this.message !== other.message) {
			return false;
		}
		else if (this.functionName !== other.functionName) {
			return false;
		}
		else if (this.fileName !== other.fileName) {
			return false;
		}
		else if (this.lineNumber !== other.lineNumber) {
			return false;
		}
		else if (this.columnNumber !== other.columnNumber) {
			return false;
		}
		else if (this.stack !== other.stack) {
			return false;
		}
		else if (this.type !== other.type) {
			return false;
		}
		else if (this.source !== other.source) {
			return false;
		}
		else {
			// same!
			return true;
		}
	};

	/**
	 * Creates a BoomerangError from an Error
	 *
	 * @param {Error} error Error object
	 * @param {number} via How the Error was found (VIA_* enum)
	 * @param {number} source Source of the error (SOURCE_* enum)
	 *
	 * @returns {BoomerangError} Error
	 */
	BoomerangError.fromError = function(error, via, source) {
		var frame, frames, lastFrame, forceUpdate = false, i, j,
		    now = BOOMR.now();

		if (!error) {
			return null;
		}

		// parse the stack
		if (error.stack) {
			if (error.stack.length > MAX_STACK_SIZE) {
				error.stack = error.stack.substr(0, MAX_STACK_SIZE);
			}

			frames = ErrorStackParser.parse(error);
			if (frames && frames.length) {
				if (error.generatedStack) {
					// if we generated the stack (we were only given a message),
					// we should remove our stack-generation function from it

					// fix-up stack generation on Chrome
					if (frames.length >= 4 &&
						frames[1].functionName &&
						frames[1].functionName.indexOf("createStackForSend") !== -1) {
						// remove the top 3 frames
						frames = frames.slice(3);
						forceUpdate = true;
					}

					// fix-up stack generation on Firefox
					if (frames.length >= 3 &&
						frames[0].functionName &&
						frames[0].functionName.indexOf("createStackForSend") !== -1) {
						// remove the top 2 frames
						frames = frames.slice(2);
						forceUpdate = true;
					}

					// strip other stack generators
					if (frames.length >= 1 &&
						frames[0].functionName &&
						frames[0].functionName.indexOf("BOOMR_plugins_errors") !== -1) {
						frames = frames.slice(1);
						forceUpdate = true;
					}
				}

				// remove our error wrappers from the stack
				for (i = 0; i < frames.length; i++) {
					if (frames[i].functionName) {
						for (j = 0; j < STACK_FUNCTIONS_REMOVE.length; j++) {
							if (frames[i].functionName.indexOf(STACK_FUNCTIONS_REMOVE[j]) !== -1) {
								frames.splice(i, 1);
								forceUpdate = true;

								// outloop continues with the next element
								i--;
								break;
							}
						}
					}
				}

				// get the top frame
				frame = frames[0];

				// fill in our error with the top frame, if not already specified
				if (forceUpdate || typeof error.lineNumber === "undefined") {
					error.lineNumber = frame.lineNumber;
				}

				if (forceUpdate || typeof error.columnNumber === "undefined") {
					error.columnNumber = frame.columnNumber;
				}

				if (forceUpdate || typeof error.functionName === "undefined") {
					error.functionName = frame.functionName;
				}

				if (forceUpdate || typeof error.fileName === "undefined") {
					error.fileName = frame.fileName;
				}

				// trim stack down
				if (error.stack) {
					// remove double-spaces
					error.stack = error.stack.replace(/\s\s+/g, " ");
				}
			}
		}
		else if (error.functionName ||
			error.fileName ||
			error.lineNumber ||
			error.columnNumber) {
			// reconstruct a single frame if given fileName, etc
			frames = [{
				lineNumber: error.lineNumber,
				columnNumber: error.columnNumber,
				fileName: error.fileName,
				functionName: error.functionName
			}];
		}

		// fixup some old browser types
		if (error.message.indexOf("ReferenceError:") !== -1
			&& error.name === "Error") {
			error.name = "ReferenceError";
		}

		// create our final object
		var err = new BoomerangError({
			code: error.code ? error.code : undefined,
			message: error.message ? error.message : undefined,
			functionName: error.functionName ? error.functionName : undefined,
			fileName: error.fileName ? error.fileName : undefined,
			lineNumber: error.lineNumber ? error.lineNumber : undefined,
			columnNumber: error.columnNumber ? error.columnNumber : undefined,
			stack: error.stack ? error.stack : undefined,
			type: error.name ? error.name : undefined,
			source: source,
			via: via,
			frames: frames,
			extra: error.extra ? error.extra : undefined,
			timestamp: error.timestamp ? error.timestamp : now
		});

		return err;
	};

	//
	// Internal config
	//
	impl = {
		//
		// Configuration
		//

		// overridable
		onError: undefined,
		monitorGlobal: true,
		monitorNetwork: true,
		monitorConsole: true,
		monitorEvents: true,
		monitorTimeout: true,
		sendAfterOnload: false,
		isDuringLoad: true,
		maxErrors: 10,
		sendInterval: 1000,
		sendIntervalId: -1,
		maxEvents: 10,

		// state
		initialized: false,
		supported: false,

		/**
		 * All errors
		 */
		errors: [],

		/**
		 * Errors queued up for the next batch
		 */
		q: [],

		/**
		 * Circular event buffer
		 */
		events: [],

		//
		// Public Functions
		//
		/**
		 * Sends an error
		 *
		 * @param {Error|String} error Error object or message
		 */
		send: function(error, via, source) {
			var now = BOOMR.now();

			if (!error) {
				return;
			}

			// defaults, if not specified
			via = via || BOOMR.plugins.Errors.VIA_APP;
			source = source ||  BOOMR.plugins.Errors.SOURCE_APP;

			// if we weren't given a stack, try to create one
			if (!error.stack && !error.noStack) {
				// run this in a function so we can detect it easier by the name,
				// and remove it from any stack frames we send
				function createStackForSend() {
					try {
						throw Error(error);
					}
					catch (ex) {
						error = ex;

						// note we generated this stack for later
						error.generatedStack = true;

						// set the time when it was created
						error.timestamp =  now;

						impl.addError(error, via, source);
					}
				}

				createStackForSend();
			}
			else {
				// add the timestamp
				error.timestamp = now;

				// send (or queue) the error
				impl.addError(error, via, source);
			}
		},

		//
		// Private Functions
		//

		/**
		 * Sends (or queues) errors
		 *
		 * @param {Error} error Error
		 * @param {number} via VIA_* constant
		 * @param {number} source SOURCE_* constant
		 */
		addError: function(error, via, source) {
			var onErrorResult, err, dup = false;

			// only track post-load errors if configured
			if (!impl.isDuringLoad && !impl.sendAfterOnload) {
				return;
			}

			// allow the user to filter out the error
			if (impl.onError) {
				try {
					onErrorResult = impl.onError(error);
				}
				catch (exc) {
					onErrorResult = false;
				}

				if (!onErrorResult) {
					return;
				}
			}

			// obey the errors limit
			if (impl.errors.length >= impl.maxErrors) {
				return;
			}

			// convert into our object
			err = BoomerangError.fromError(error, via, source);

			// add to our list of errors seen for all time
			dup = impl.mergeDuplicateErrors(impl.errors, err, false);

			// fire an error event with the duped or new error
			BOOMR.fireEvent("onerror", dup || err);

			// add to our current queue
			impl.mergeDuplicateErrors(impl.q, err, true);

			if (!impl.isDuringLoad && impl.sendIntervalId === -1) {
				if (dup) {
					// If this is not during a load, and it's a duplicate of
					// a previous error, don't send a beacon just for itself
					return;
				}

				// errors outside of a load will be sent at the next interval
				impl.sendIntervalId = setTimeout(function() {
					impl.sendIntervalId = -1;

					// change this to an 'error' beacon
					BOOMR.addVar("http.initiator", "error");

					// set it as an API beacon, which means it won't have any timing data
					BOOMR.addVar("api", 1);

					// add our errors to the beacon
					impl.addErrorsToBeacon();

					// send it!
					BOOMR.sendBeacon();
				}, impl.sendInterval);
			}
		},

		/**
		 * Finds a duplicate BoomerangErrors in the specified array
		 *
		 * @param {Array[]} errors Array of BoomerangErrors
		 * @param {BoomerangError} err BoomerangError to check
		 *
		 * @returns {BoomerangError} BoomerangErrors that was duped against, if any
		 */
		findDuplicateError: function(errors, err) {
			if (!Array.isArray(errors) || typeof err === "undefined") {
				return undefined;
			}

			for (var i = 0; i < errors.length; i++) {
				if (errors[i].equals(err)) {
					return errors[i];
				}
			}

			return undefined;
		},

		/**
		 * Merges duplicate BoomerangErrors
		 *
		 * @param {Array[]} errors Array of BoomerangErrors
		 * @param {BoomerangError} err BoomerangError to check
		 * @param {boolean} bumpCount Increment the count of any found duplicates
		 *
		 * @returns {BoomerangError} BoomerangErrors that was duped against, if any
		 */
		mergeDuplicateErrors: function(errors, err, bumpCount) {
			if (!Array.isArray(errors) || typeof err === "undefined") {
				return undefined;
			}

			var dup = impl.findDuplicateError(errors, err);
			if (dup) {
				if (bumpCount) {
					dup.count += err.count;
				}

				return dup;
			}
			else {
				errors.push(err);
				return undefined;
			}
		},

		/**
		 * Fired 'onbeacon'
		 */
		onBeacon: function() {
			// remove our err vars
			BOOMR.removeVar("err");
			BOOMR.removeVar("api");
			BOOMR.removeVar("http.initiator");
		},

		/**
		 * Fired on 'page_ready'
		 */
		pageReady: function() {
			impl.isDuringLoad = false;
		},

		/**
		 * Retrieves the current errors
		 *
		 * @returns {BoomerangError[]}
		 */
		getErrors: function() {
			if (impl.errors.length === 0) {
				return false;
			}

			return impl.errors;
		},

		/**
		 * Gets errors suitable for transmission in a URL
		 *
		 * @param {BoomerangError[]} errors BoomerangErrors array
		 *
		 * @returns {string} String for URL
		 */
		getErrorsForUrl: function(errors) {
			errors = impl.compressErrors(errors);

			if (BOOMR.utils.Compression.jsUrl) {
				return BOOMR.utils.Compression.jsUrl(errors);
			}
			else if (window.JSON) {
				url += JSON.stringify(errors);
			}
			else {
				// not supported
				BOOMR.debug("JSON is not supported", "Errors");
				return "";
			}
		},

		/**
		 * Adds any queue'd errors to the beacon
		 */
		addErrorsToBeacon: function() {
			if (impl.q.length) {
				var err = this.getErrorsForUrl(impl.q);
				if (err) {
					BOOMR.addVar("err", err);
				}

				impl.q = [];
			}
		},

		/**
		 * Fired 'before_beacon'
		 */
		beforeBeacon: function() {
			impl.addErrorsToBeacon();
		},

		/**
		 * Wraps calls to functionName in an exception handler that will
		 * automatically report exceptions.
		 *
		 * @param {string} functionName Function name
		 * @param {object} that Target object
		 * @param {boolean} useCallingObject Whether or not to use the calling object for 'this'
		 * @param {number} callbackIndex Which argument is the callback
		 * @param {number} via Via
		 */
		wrapFn: function(functionName, that, useCallingObject, callbackIndex, via) {
			var origFn = that[functionName];

			if (typeof origFn !== "function") {
				return;
			}

			that[functionName] = function() {
				try {
					var args = Array.prototype.slice.call(arguments);
					var callbackFn = args[callbackIndex];
					var targetObj = useCallingObject ? this : that;
					var wrappedFn = impl.wrap(callbackFn, targetObj, via);

					args[callbackIndex] = wrappedFn;

					if (functionName === "addEventListener") {
						// for removeEventListener we need to keep track of this
						// unique tuple of target object, event name (arg0), original function
						// and capture (arg2)
						impl.trackFn(targetObj, args[0], callbackFn, args[2], wrappedFn);
					}

					return origFn.apply(targetObj, args);
				}
				catch (e) {
					// error during original callback setup
					impl.send(e, via);
				}
			};
		},

		/**
		 * Tracks the specified function for removeEventListener.
		 *
		 * @param {object} target Target element (window, element, etc)
		 * @param {string} type Event type (name)
		 * @param {function} listener Original listener
		 * @param {boolean} useCapture Use capture
		 * @param {function} wrapped Wrapped function
		 */
		trackFn: function(target, type, listener, useCapture, wrapped) {
			if (!target) {
				return;
			}

			if (impl.trackedFnIdx(target, type, listener, useCapture) !== -1) {
				// already tracked
				return;
			}

			if (!target._bmrEvents) {
				target._bmrEvents = [];
			}

			target._bmrEvents.push([type, listener, !!useCapture, wrapped]);
		},

		/**
		 * Gets the index of the tracked function.
		 *
		 * @param {object} target Target element (window, element, etc)
		 * @param {string} type Event type (name)
		 * @param {function} listener Original listener
		 * @param {boolean} useCapture Use capture
		 *
		 * @returns {number} Index of already tracked function, or -1 if it doesn't exist
		 */
		trackedFnIdx: function(target, type, listener, useCapture) {
			var i, f;

			if (!target) {
				return;
			}

			if (!target._bmrEvents) {
				target._bmrEvents = [];
			}

			for (i = 0; i < target._bmrEvents.length; i++) {
				f = target._bmrEvents[i];
				if (f[0] === type &&
				    f[1] === listener &&
				    f[2] === !!useCapture) {
					return i;
				}
			}

			return -1;
		},

		/**
		 * Wraps removeEventListener to work with our wrapFn
		 *
		 * @param {object} that Target object
		 */
		wrapRemoveEventListener: function(that) {
			var fn = "removeEventListener", origFn = that[fn], idx, wrappedFn;

			if (typeof origFn !== "function") {
				return;
			}

			that[fn] = function(type, listener, useCapture) {
				idx = impl.trackedFnIdx(this, type, listener, useCapture);
				if (idx !== -1) {
					wrappedFn = this._bmrEvents[idx][3];

					// remove our wrapped function instead
					origFn.call(this, type, wrappedFn, useCapture);

					// remove bookkeeping
					this._bmrEvents.splice(idx, 1);
				}
				else {
					// unknown, pass original args
					origFn.call(this, type, listener, useCapture);
				}
			};
		},

		/**
		 * Wraps the function in an exception handler that will
		 * automatically report exceptions.
		 *
		 * @param {function} fn Function
		 * @param {object} that Target object
		 * @param {number} via Via (optional)
		 *
		 * @returns {function} Wrapped function
		 */
		wrap: function(fn, that, via) {
			if (typeof fn !== "function") {
				// Return the input argument as-is.  This might happen if the argument
				// to setTimeout/setInterval is a string, which is deprecated but supported
				// by all browsers, however it isn't something we can wrap (we don't want to have
				// eval statements in the code).
				return fn;
			}

			via = via || BOOMR.plugins.Errors.VIA_APP;

			return function BOOMR_plugins_errors_wrap() {
				try {
					return fn.apply(that, arguments);
				}
				catch (e) {
					// error during callback
					impl.send(e, via);
				}
			};
		},

		/**
		 * Runs the function, watching for exceptions
		 *
		 * @param {function} fn Function
		 * @param {object} that Target object
		 * @param {object[]} args Arguments
		 */
		test: function() {
			var fn, that, args;
			if (arguments.length === 0) {
				return undefined;
			}

			// the function to run is the first argument
			fn = arguments[0];
			if (typeof fn !== "function") {
				return undefined;
			}

			// the object is the second
			that = arguments.length > 1 ? arguments[1] : BOOMR.window;

			// additional arguments after
			var args = Array.prototype.slice.call(arguments, 2);

			// run the fn
			return impl.wrap(fn, that).apply(that, args);
		},

		/**
		 * Normalizes an object to a string
		 *
		 * @param {object} obj Object
		 * @returns {string} String version of the object
		 */
		normalizeToString: function(obj) {
			if (obj === undefined) {
				return "undefined";
			}
			else if (obj === null) {
				return "null";
			}
			else if (typeof obj === "number" && isNaN(obj)) {
				return "NaN";
			}
			else if (obj === "") {
				return "(empty string)";
			}
			else if (obj === 0) {
				return "0";
			}
			else if (!obj) {
				return "false";
			}
			else if (typeof obj === "function") {
				return "(function)";
			}
			else if (obj && typeof obj.toString === "function") {
				return obj.toString();
			}
			else {
				return "(unknown)";
			}
		},

		/**
		 * Compresses BoomerangErrors to a smaller properties for transmission
		 *
		 * count -> n if > 1
		 * frames -> f
		 * frames[].lineNumber -> f[].l
		 * frames[].columnNumber -> f[].c
		 * frames[].functionName -> f[].f
		 * frames[].fileName -> f[].w or .wo (stripped of root origin)
		 * events -> e
		 * events[].type -> e[].t
		 * events[].timestamp -> e[].d
		 * events[].[other] -> each type has its own data
		 * source -> s
		 * via -> v
		 * type -> t
		 * code -> c
		 * message -> m
		 * extra -> x
		 * events -> e
		 * timestamp -> d (base 36)
		 *
		 * stack, fileName, functionName, lineNumber and columnNumber are dropped
		 * since they're frame[0]
		 *
		 * @params {BoomerangError[]} errors Errors array
		 *
		 * @returns {BoomerangError[]} Compressed errors array
		 */
		compressErrors: function(errors) {
			var i, j, err, frame, evt, minFrame, minEvent, o, obj, timestamp = 0;

			// get the origin
			o = BOOMR.window.location.origin;

			// minimize the contents of each error
			for (i = 0; i < errors.length; i++) {
				err = errors[i];

				// we're going to create a new object with minimized property
				// names and values to reduce byte size
				obj = {};

				// 1-count is assumed
				if (err.count !== 1) {
					obj.n = err.count;
				}

				if (typeof err.timestamp === "number") {
					timestamp = err.timestamp;
					obj.d = err.timestamp.toString(36);
				}

				// frames
				if (err.frames.length) {
					obj.f = [];

					// compress all frames
					for (j = 0; j < err.frames.length; j++) {
						frame = err.frames[j];

						// encode numeric properties
						if (frame.lineNumber) {
							frame.lineNumber = parseInt(frame.lineNumber, 10);
						}

						if (frame.columnNumber) {
							frame.columnNumber = parseInt(frame.columnNumber, 10);
						}

						minFrame = {
							l: frame.lineNumber,
							c: frame.columnNumber
						};

						// drop origin from filename
						if (typeof frame.fileName === "string") {
							if (frame.fileName.indexOf(o) !== -1) {
								minFrame.wo = frame.fileName.replace(o, "");
							}
							else {
								minFrame.w = frame.fileName;
							}
						}

						if (typeof frame.functionName === "string") {
							minFrame.f = frame.functionName;
						}

						obj.f.push(minFrame);
					}
				}

				// don't copy events if there aren't any
				if (err.events.length) {
					obj.e = [];

					// compress all events
					for (j = 0; j < err.events.length; j++) {
						evt = err.events[j];

						minEvent = {
							t: evt.type,
							d: timestamp ? (timestamp - evt.timestamp) : evt.timestamp
						};

						// type-specific compression
						if (evt.type === BOOMR.plugins.Errors.EVENT_CLICK) {
							if (evt.id) {
								minEvent.i = evt.id;
							}

							if (evt.name) {
								minEvent.n = evt.name;
							}

							if (evt.tagName) {
								minEvent.g = evt.tagName;
							}
						}
						else if (evt.type === BOOMR.plugins.Errors.EVENT_NETWORK) {
							if (evt.url) {
								minEvent.u = evt.url;
							}

							if (evt.method) {
								minEvent.m = evt.method;
							}

							if (evt.result) {
								minEvent.r = evt.result;
							}
						}
						else if (evt.type === BOOMR.plugins.Errors.EVENT_LOG) {
							if (evt.severity) {
								minEvent.s = evt.severity;
							}

							if (evt.message) {
								minEvent.m = evt.message;
							}
						}

						obj.e.push(minEvent);
					}
				}

				// don't need to add these properties as they're in the first frame:
				// lineNumber
				// columnNumber
				// functionName
				// fileName

				//
				// Only copy non-default values
				//
				if (err.source !== BOOMR.plugins.Errors.SOURCE_APP) {
					obj.s = err.source;
				}

				if (typeof err.via !== "undefined" && err.via !== BOOMR.plugins.Errors.VIA_APP) {
					obj.v = err.via;
				}

				if (typeof err.type !== "undefined" && err.type !== "Error") {
					obj.t = err.type;
				}

				if (err.code) {
					obj.c = err.code;
				}

				if (err.message) {
					obj.m = err.message;
				}

				if (err.extra) {
					obj.x = err.extra;
				}

				// send minimized object
				errors[i] = obj;
			}

			return errors;
		}

		/* BEGIN_DEBUG */,
		/**
		 * Decompresses URL-transmitted BoomerangErrors back into the full object
		 *
		 * @params {BoomerangError[]} errors Errors array
		 *
		 * @returns {BoomerangError[]} Decompressed errors array
		 */
		decompressErrors: function(errors) {
			var i, j, err, frame, o;

			// get the origin
			o = BOOMR.window.location.origin;

			for (i = 0; i < errors.length; i++) {
				err = errors[i];

				// 1-count is assumed
				if (err.n) {
					err.count = parseInt(err.n, 10);
				}
				else {
					err.count = 1;
				}

				// timestamp is base-36
				if (err.d) {
					err.timestamp = parseInt(err.d, 36);
				}

				// frames
				err.frames = [];

				if (err.m) {
					err.message = err.m;
				}

				// start reconstructing the stack
				err.stack = err.message ? (err.message + " ") : "";

				// decompress all frames
				if (err.f) {
					for (j = 0; j < err.f.length; j++) {
						frame = err.f[j];

						// replace minimized property names with their full ones
						if (frame.l) {
							frame.lineNumber = parseInt(frame.l, 10);
						}

						if (frame.c) {
							frame.columnNumber = parseInt(frame.c, 10);
						}

						if (frame.f) {
							frame.functionName = frame.f;
						}

						if (frame.w) {
							frame.fileName = frame.w;
						}

						if (frame.wo) {
							frame.fileName = o + frame.wo;
						}

						delete frame.c;
						delete frame.l;
						delete frame.f;
						delete frame.w;
						delete frame.wo;

						err.frames.push(frame);

						// reconstruct the stack
						if (j !== 0) {
							err.stack += "\n";
						}

						err.stack += "at";

						if (frame.functionName) {
							err.stack += " " + frame.functionName;
						}

						if (frame.functionName && frame.fileName) {
							err.stack += " (" + frame.fileName;
						}
						else if (!frame.functionName && frame.fileName) {
							err.stack += " " + frame.fileName;
						}

						if (frame.lineNumber) {
							err.stack += ":" + frame.lineNumber;
						}

						if (frame.columnNumber) {
							err.stack += ":" + frame.columnNumber;
						}

						if (frame.functionName && frame.fileName) {
							err.stack += ")";
						}
					}

					// copy propeties from top frame
					err.lineNumber = err.frames[0].lineNumber;
					err.columnNumber = err.frames[0].columnNumber;
					err.functionName = err.frames[0].functionName;
					err.fileName = err.frames[0].fileName;
				}

				err.events = err.e || [];

				// copy over values or defaults
				err.source = err.s ? err.s : BOOMR.plugins.Errors.SOURCE_APP;
				err.via = err.v ? err.v : BOOMR.plugins.Errors.VIA_APP;
				err.type = err.t ? err.t : "Error";

				if (err.x) {
					err.extra = err.x;
				}

				if (err.c) {
					err.code = parseInt(err.c, 10);
				}

				// delete minimized property names
				delete err.c;
				delete err.f;
				delete err.e;
				delete err.s;
				delete err.v;
				delete err.t;
				delete err.m;
				delete err.n;
				delete err.x;
				delete err.d;
			}

			return errors;
		}
		/* END_DEBUG */
	};

	var E = BOOMR.plugins.Errors = {
		init: function(config) {
			BOOMR.utils.pluginConfig(impl, config, "Errors",
				["onError", "monitorGlobal", "monitorNetwork", "monitorConsole",
				 "monitorEvents", "monitorTimeout", "sendAfterOnload",
				 "sendInterval", "maxErrors"]);

			if (impl.initialized) {
				return this;
			}

			impl.initialized = true;

			// TODO determine what we don't support
			impl.supported = true;

			if (!impl.supported) {
				return this;
			}

			// only if we're supported
			BOOMR.subscribe("before_beacon", impl.beforeBeacon, null, impl);
			BOOMR.subscribe("onbeacon", impl.onBeacon, null, impl);
			BOOMR.subscribe("page_ready", impl.pageReady, null, impl);

			// register an event
			BOOMR.registerEvent("onerror");

			// hook into window.onError if configured
			if (impl.monitorGlobal) {
				try {
					var globalOnError = BOOMR.window.onerror;

					BOOMR.window.onerror = function BOOMR_plugins_errors_onerror(message, fileName, lineNumber, columnNumber, error) {
						// a SyntaxError can produce a null error
						if (typeof error !== "undefined" && error !== null) {
							impl.send(error, E.VIA_GLOBAL_EXCEPTION_HANDLER);
						}
						else {
							impl.send({
								message: message,
								fileName: fileName,
								lineNumber: lineNumber,
								columnNumber: columnNumber,
								noStack: true
							}, E.VIA_GLOBAL_EXCEPTION_HANDLER);
						}

						if (typeof globalOnError === "function") {
							globalOnError.apply(window, arguments);
						}
					};
				}
				catch (e) {
					BOOMR.debug("Exception in the window.onerror handler", "Errors");
				}
			}

			// listen for XHR errors
			if (impl.monitorNetwork) {
				BOOMR.subscribe("onxhrerror", function BOOMR_plugins_errors_onxhrerror(resource) {
					impl.send({
						code: resource.status,
						message: resource.url,
						noStack: true
					}, E.VIA_NETWORK);
				});
			}

			if (impl.monitorConsole) {
				if (!BOOMR.window.console) {
					BOOMR.window.console = {};
				}

				var globalConsole = BOOMR.window.console.error;

				try {
					BOOMR.window.console.error = function BOOMR_plugins_errors_console_error() {
						// get a copy of the args
						var args = Array.prototype.slice.call(arguments);

						if (args.length === 1) {
							// send just the first argument
							impl.send(impl.normalizeToString(args[0]), E.VIA_CONSOLE);
						}
						else {
							// get the array of arguments
							impl.send(impl.normalizeToString(args), E.VIA_CONSOLE);
						}

						if (typeof globalConsole === "function") {
							if (typeof globalConsole.apply === "function") {
								globalConsole.apply(this, args);
							}
							else {
								globalConsole(args[0], args[1], args[2]);
							}
						}
					};
				}
				catch (h) {
					BOOMR.debug("Exception in the window.console.error handler", "Errors");
				}
			}

			if (impl.monitorEvents && BOOMR.window.addEventListener && BOOMR.window.Element) {
				impl.wrapFn("addEventListener", BOOMR.window, false, 1, E.VIA_EVENTHANDLER);
				impl.wrapFn("addEventListener", BOOMR.window.Element.prototype, true, 1, E.VIA_EVENTHANDLER);
				impl.wrapFn("addEventListener", BOOMR.window.XMLHttpRequest.prototype, true, 1, E.VIA_EVENTHANDLER);

				impl.wrapRemoveEventListener(BOOMR.window);
				impl.wrapRemoveEventListener(BOOMR.window.Element.prototype);
				impl.wrapRemoveEventListener(BOOMR.window.XMLHttpRequest.prototype);
			}

			if (impl.monitorTimeout) {
				impl.wrapFn("setTimeout", BOOMR.window, false, 0, E.VIA_TIMEOUT);
				impl.wrapFn("setInterval", BOOMR.window, false, 0, E.VIA_TIMEOUT);
			}

			return this;
		},
		is_complete: function() {
			return true;
		},
		is_supported: function() {
			return impl.initialized && impl.supported;
		},
		//
		// Public Exports
		//
		// constants
		SOURCE_APP: 1,
		SOURCE_BOOMERANG: 2,

		VIA_APP: 1,
		VIA_GLOBAL_EXCEPTION_HANDLER: 2,
		VIA_NETWORK: 3,
		VIA_CONSOLE: 4,
		VIA_EVENTHANDLER: 5,
		VIA_TIMEOUT: 6,

		EVENT_CLICK: 1,
		EVENT_NETWORK: 2,
		EVENT_LOG: 3,

		// functions
		send: impl.send,
		wrap: impl.wrap,
		test: impl.test,

		// objects
		BoomerangError: BoomerangError

		//
		// Test Exports (only for debug)
		//
		/* BEGIN_DEBUG */,
		BoomerangError: BoomerangError,
		findDuplicateError: impl.findDuplicateError,
		mergeDuplicateErrors: impl.mergeDuplicateErrors,
		compressErrors: impl.compressErrors,
		decompressErrors: impl.decompressErrors,
		normalizeToString: impl.normalizeToString
		/* END_DEBUG */
	};

}());

BOOMR.t_end = new Date().getTime();
