var app = (function () {
	'use strict';

	/** @returns {void} */
	function noop() {}

	/** @returns {void} */
	function add_location(element, file, line, column, char) {
		element.__svelte_meta = {
			loc: { file, line, column, char }
		};
	}

	function run(fn) {
		return fn();
	}

	function blank_object() {
		return Object.create(null);
	}

	/**
	 * @param {Function[]} fns
	 * @returns {void}
	 */
	function run_all(fns) {
		fns.forEach(run);
	}

	/**
	 * @param {any} thing
	 * @returns {thing is Function}
	 */
	function is_function(thing) {
		return typeof thing === 'function';
	}

	/** @returns {boolean} */
	function safe_not_equal(a, b) {
		return a != a ? b == b : a !== b || (a && typeof a === 'object') || typeof a === 'function';
	}

	/** @returns {boolean} */
	function is_empty(obj) {
		return Object.keys(obj).length === 0;
	}

	/**
	 * @param {Node} target
	 * @param {Node} node
	 * @returns {void}
	 */
	function append(target, node) {
		target.appendChild(node);
	}

	/**
	 * @param {Node} target
	 * @param {Node} node
	 * @param {Node} [anchor]
	 * @returns {void}
	 */
	function insert(target, node, anchor) {
		target.insertBefore(node, anchor || null);
	}

	/**
	 * @param {Node} node
	 * @returns {void}
	 */
	function detach(node) {
		if (node.parentNode) {
			node.parentNode.removeChild(node);
		}
	}

	/**
	 * @template {keyof HTMLElementTagNameMap} K
	 * @param {K} name
	 * @returns {HTMLElementTagNameMap[K]}
	 */
	function element(name) {
		return document.createElement(name);
	}

	/**
	 * @template {keyof SVGElementTagNameMap} K
	 * @param {K} name
	 * @returns {SVGElement}
	 */
	function svg_element(name) {
		return document.createElementNS('http://www.w3.org/2000/svg', name);
	}

	/**
	 * @param {string} data
	 * @returns {Text}
	 */
	function text(data) {
		return document.createTextNode(data);
	}

	/**
	 * @returns {Text} */
	function space() {
		return text(' ');
	}

	/**
	 * @param {EventTarget} node
	 * @param {string} event
	 * @param {EventListenerOrEventListenerObject} handler
	 * @param {boolean | AddEventListenerOptions | EventListenerOptions} [options]
	 * @returns {() => void}
	 */
	function listen(node, event, handler, options) {
		node.addEventListener(event, handler, options);
		return () => node.removeEventListener(event, handler, options);
	}

	/**
	 * @param {Element} node
	 * @param {string} attribute
	 * @param {string} [value]
	 * @returns {void}
	 */
	function attr(node, attribute, value) {
		if (value == null) node.removeAttribute(attribute);
		else if (node.getAttribute(attribute) !== value) node.setAttribute(attribute, value);
	}

	/**
	 * @param {Element} element
	 * @returns {ChildNode[]}
	 */
	function children(element) {
		return Array.from(element.childNodes);
	}

	/**
	 * @returns {void} */
	function set_input_value(input, value) {
		input.value = value == null ? '' : value;
	}

	/**
	 * @returns {void} */
	function toggle_class(element, name, toggle) {
		// The `!!` is required because an `undefined` flag means flipping the current state.
		element.classList.toggle(name, !!toggle);
	}

	/**
	 * @template T
	 * @param {string} type
	 * @param {T} [detail]
	 * @param {{ bubbles?: boolean, cancelable?: boolean }} [options]
	 * @returns {CustomEvent<T>}
	 */
	function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
		return new CustomEvent(type, { detail, bubbles, cancelable });
	}

	/**
	 * @typedef {Node & {
	 * 	claim_order?: number;
	 * 	hydrate_init?: true;
	 * 	actual_end_child?: NodeEx;
	 * 	childNodes: NodeListOf<NodeEx>;
	 * }} NodeEx
	 */

	/** @typedef {ChildNode & NodeEx} ChildNodeEx */

	/** @typedef {NodeEx & { claim_order: number }} NodeEx2 */

	/**
	 * @typedef {ChildNodeEx[] & {
	 * 	claim_info?: {
	 * 		last_index: number;
	 * 		total_claimed: number;
	 * 	};
	 * }} ChildNodeArray
	 */

	let current_component;

	/** @returns {void} */
	function set_current_component(component) {
		current_component = component;
	}

	const dirty_components = [];
	const binding_callbacks = [];

	let render_callbacks = [];

	const flush_callbacks = [];

	const resolved_promise = /* @__PURE__ */ Promise.resolve();

	let update_scheduled = false;

	/** @returns {void} */
	function schedule_update() {
		if (!update_scheduled) {
			update_scheduled = true;
			resolved_promise.then(flush);
		}
	}

	/** @returns {void} */
	function add_render_callback(fn) {
		render_callbacks.push(fn);
	}

	// flush() calls callbacks in this order:
	// 1. All beforeUpdate callbacks, in order: parents before children
	// 2. All bind:this callbacks, in reverse order: children before parents.
	// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
	//    for afterUpdates called during the initial onMount, which are called in
	//    reverse order: children before parents.
	// Since callbacks might update component values, which could trigger another
	// call to flush(), the following steps guard against this:
	// 1. During beforeUpdate, any updated components will be added to the
	//    dirty_components array and will cause a reentrant call to flush(). Because
	//    the flush index is kept outside the function, the reentrant call will pick
	//    up where the earlier call left off and go through all dirty components. The
	//    current_component value is saved and restored so that the reentrant call will
	//    not interfere with the "parent" flush() call.
	// 2. bind:this callbacks cannot trigger new flush() calls.
	// 3. During afterUpdate, any updated components will NOT have their afterUpdate
	//    callback called a second time; the seen_callbacks set, outside the flush()
	//    function, guarantees this behavior.
	const seen_callbacks = new Set();

	let flushidx = 0; // Do *not* move this inside the flush() function

	/** @returns {void} */
	function flush() {
		// Do not reenter flush while dirty components are updated, as this can
		// result in an infinite loop. Instead, let the inner flush handle it.
		// Reentrancy is ok afterwards for bindings etc.
		if (flushidx !== 0) {
			return;
		}
		const saved_component = current_component;
		do {
			// first, call beforeUpdate functions
			// and update components
			try {
				while (flushidx < dirty_components.length) {
					const component = dirty_components[flushidx];
					flushidx++;
					set_current_component(component);
					update(component.$$);
				}
			} catch (e) {
				// reset dirty state to not end up in a deadlocked state and then rethrow
				dirty_components.length = 0;
				flushidx = 0;
				throw e;
			}
			set_current_component(null);
			dirty_components.length = 0;
			flushidx = 0;
			while (binding_callbacks.length) binding_callbacks.pop()();
			// then, once components are updated, call
			// afterUpdate functions. This may cause
			// subsequent updates...
			for (let i = 0; i < render_callbacks.length; i += 1) {
				const callback = render_callbacks[i];
				if (!seen_callbacks.has(callback)) {
					// ...so guard against infinite loops
					seen_callbacks.add(callback);
					callback();
				}
			}
			render_callbacks.length = 0;
		} while (dirty_components.length);
		while (flush_callbacks.length) {
			flush_callbacks.pop()();
		}
		update_scheduled = false;
		seen_callbacks.clear();
		set_current_component(saved_component);
	}

	/** @returns {void} */
	function update($$) {
		if ($$.fragment !== null) {
			$$.update();
			run_all($$.before_update);
			const dirty = $$.dirty;
			$$.dirty = [-1];
			$$.fragment && $$.fragment.p($$.ctx, dirty);
			$$.after_update.forEach(add_render_callback);
		}
	}

	/**
	 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
	 * @param {Function[]} fns
	 * @returns {void}
	 */
	function flush_render_callbacks(fns) {
		const filtered = [];
		const targets = [];
		render_callbacks.forEach((c) => (fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c)));
		targets.forEach((c) => c());
		render_callbacks = filtered;
	}

	const outroing = new Set();

	/**
	 * @param {import('./private.js').Fragment} block
	 * @param {0 | 1} [local]
	 * @returns {void}
	 */
	function transition_in(block, local) {
		if (block && block.i) {
			outroing.delete(block);
			block.i(local);
		}
	}

	/** @typedef {1} INTRO */
	/** @typedef {0} OUTRO */
	/** @typedef {{ direction: 'in' | 'out' | 'both' }} TransitionOptions */
	/** @typedef {(node: Element, params: any, options: TransitionOptions) => import('../transition/public.js').TransitionConfig} TransitionFn */

	/**
	 * @typedef {Object} Outro
	 * @property {number} r
	 * @property {Function[]} c
	 * @property {Object} p
	 */

	/**
	 * @typedef {Object} PendingProgram
	 * @property {number} start
	 * @property {INTRO|OUTRO} b
	 * @property {Outro} [group]
	 */

	/**
	 * @typedef {Object} Program
	 * @property {number} a
	 * @property {INTRO|OUTRO} b
	 * @property {1|-1} d
	 * @property {number} duration
	 * @property {number} start
	 * @property {number} end
	 * @property {Outro} [group]
	 */

	/** @returns {void} */
	function mount_component(component, target, anchor) {
		const { fragment, after_update } = component.$$;
		fragment && fragment.m(target, anchor);
		// onMount happens before the initial afterUpdate
		add_render_callback(() => {
			const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
			// if the component was destroyed immediately
			// it will update the `$$.on_destroy` reference to `null`.
			// the destructured on_destroy may still reference to the old array
			if (component.$$.on_destroy) {
				component.$$.on_destroy.push(...new_on_destroy);
			} else {
				// Edge case - component was destroyed immediately,
				// most likely as a result of a binding initialising
				run_all(new_on_destroy);
			}
			component.$$.on_mount = [];
		});
		after_update.forEach(add_render_callback);
	}

	/** @returns {void} */
	function destroy_component(component, detaching) {
		const $$ = component.$$;
		if ($$.fragment !== null) {
			flush_render_callbacks($$.after_update);
			run_all($$.on_destroy);
			$$.fragment && $$.fragment.d(detaching);
			// TODO null out other refs, including component.$$ (but need to
			// preserve final state?)
			$$.on_destroy = $$.fragment = null;
			$$.ctx = [];
		}
	}

	/** @returns {void} */
	function make_dirty(component, i) {
		if (component.$$.dirty[0] === -1) {
			dirty_components.push(component);
			schedule_update();
			component.$$.dirty.fill(0);
		}
		component.$$.dirty[(i / 31) | 0] |= 1 << i % 31;
	}

	// TODO: Document the other params
	/**
	 * @param {SvelteComponent} component
	 * @param {import('./public.js').ComponentConstructorOptions} options
	 *
	 * @param {import('./utils.js')['not_equal']} not_equal Used to compare props and state values.
	 * @param {(target: Element | ShadowRoot) => void} [append_styles] Function that appends styles to the DOM when the component is first initialised.
	 * This will be the `add_css` function from the compiled component.
	 *
	 * @returns {void}
	 */
	function init(
		component,
		options,
		instance,
		create_fragment,
		not_equal,
		props,
		append_styles = null,
		dirty = [-1]
	) {
		const parent_component = current_component;
		set_current_component(component);
		/** @type {import('./private.js').T$$} */
		const $$ = (component.$$ = {
			fragment: null,
			ctx: [],
			// state
			props,
			update: noop,
			not_equal,
			bound: blank_object(),
			// lifecycle
			on_mount: [],
			on_destroy: [],
			on_disconnect: [],
			before_update: [],
			after_update: [],
			context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
			// everything else
			callbacks: blank_object(),
			dirty,
			skip_bound: false,
			root: options.target || parent_component.$$.root
		});
		append_styles && append_styles($$.root);
		let ready = false;
		$$.ctx = instance
			? instance(component, options.props || {}, (i, ret, ...rest) => {
					const value = rest.length ? rest[0] : ret;
					if ($$.ctx && not_equal($$.ctx[i], ($$.ctx[i] = value))) {
						if (!$$.skip_bound && $$.bound[i]) $$.bound[i](value);
						if (ready) make_dirty(component, i);
					}
					return ret;
			  })
			: [];
		$$.update();
		ready = true;
		run_all($$.before_update);
		// `false` as a special case of no DOM component
		$$.fragment = create_fragment ? create_fragment($$.ctx) : false;
		if (options.target) {
			if (options.hydrate) {
				// TODO: what is the correct type here?
				// @ts-expect-error
				const nodes = children(options.target);
				$$.fragment && $$.fragment.l(nodes);
				nodes.forEach(detach);
			} else {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				$$.fragment && $$.fragment.c();
			}
			if (options.intro) transition_in(component.$$.fragment);
			mount_component(component, options.target, options.anchor);
			flush();
		}
		set_current_component(parent_component);
	}

	/**
	 * Base class for Svelte components. Used when dev=false.
	 *
	 * @template {Record<string, any>} [Props=any]
	 * @template {Record<string, any>} [Events=any]
	 */
	class SvelteComponent {
		/**
		 * ### PRIVATE API
		 *
		 * Do not use, may change at any time
		 *
		 * @type {any}
		 */
		$$ = undefined;
		/**
		 * ### PRIVATE API
		 *
		 * Do not use, may change at any time
		 *
		 * @type {any}
		 */
		$$set = undefined;

		/** @returns {void} */
		$destroy() {
			destroy_component(this, 1);
			this.$destroy = noop;
		}

		/**
		 * @template {Extract<keyof Events, string>} K
		 * @param {K} type
		 * @param {((e: Events[K]) => void) | null | undefined} callback
		 * @returns {() => void}
		 */
		$on(type, callback) {
			if (!is_function(callback)) {
				return noop;
			}
			const callbacks = this.$$.callbacks[type] || (this.$$.callbacks[type] = []);
			callbacks.push(callback);
			return () => {
				const index = callbacks.indexOf(callback);
				if (index !== -1) callbacks.splice(index, 1);
			};
		}

		/**
		 * @param {Partial<Props>} props
		 * @returns {void}
		 */
		$set(props) {
			if (this.$$set && !is_empty(props)) {
				this.$$.skip_bound = true;
				this.$$set(props);
				this.$$.skip_bound = false;
			}
		}
	}

	/**
	 * @typedef {Object} CustomElementPropDefinition
	 * @property {string} [attribute]
	 * @property {boolean} [reflect]
	 * @property {'String'|'Boolean'|'Number'|'Array'|'Object'} [type]
	 */

	// generated during release, do not modify

	/**
	 * The current version, as set in package.json.
	 *
	 * https://svelte.dev/docs/svelte-compiler#svelte-version
	 * @type {string}
	 */
	const VERSION = '4.2.17';
	const PUBLIC_VERSION = '4';

	/**
	 * @template T
	 * @param {string} type
	 * @param {T} [detail]
	 * @returns {void}
	 */
	function dispatch_dev(type, detail) {
		document.dispatchEvent(custom_event(type, { version: VERSION, ...detail }, { bubbles: true }));
	}

	/**
	 * @param {Node} target
	 * @param {Node} node
	 * @returns {void}
	 */
	function append_dev(target, node) {
		dispatch_dev('SvelteDOMInsert', { target, node });
		append(target, node);
	}

	/**
	 * @param {Node} target
	 * @param {Node} node
	 * @param {Node} [anchor]
	 * @returns {void}
	 */
	function insert_dev(target, node, anchor) {
		dispatch_dev('SvelteDOMInsert', { target, node, anchor });
		insert(target, node, anchor);
	}

	/**
	 * @param {Node} node
	 * @returns {void}
	 */
	function detach_dev(node) {
		dispatch_dev('SvelteDOMRemove', { node });
		detach(node);
	}

	/**
	 * @param {Node} node
	 * @param {string} event
	 * @param {EventListenerOrEventListenerObject} handler
	 * @param {boolean | AddEventListenerOptions | EventListenerOptions} [options]
	 * @param {boolean} [has_prevent_default]
	 * @param {boolean} [has_stop_propagation]
	 * @param {boolean} [has_stop_immediate_propagation]
	 * @returns {() => void}
	 */
	function listen_dev(
		node,
		event,
		handler,
		options,
		has_prevent_default,
		has_stop_propagation,
		has_stop_immediate_propagation
	) {
		const modifiers =
			options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
		if (has_prevent_default) modifiers.push('preventDefault');
		if (has_stop_propagation) modifiers.push('stopPropagation');
		if (has_stop_immediate_propagation) modifiers.push('stopImmediatePropagation');
		dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
		const dispose = listen(node, event, handler, options);
		return () => {
			dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
			dispose();
		};
	}

	/**
	 * @param {Element} node
	 * @param {string} attribute
	 * @param {string} [value]
	 * @returns {void}
	 */
	function attr_dev(node, attribute, value) {
		attr(node, attribute, value);
		if (value == null) dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
		else dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
	}

	/**
	 * @param {Element} node
	 * @param {string} property
	 * @param {any} [value]
	 * @returns {void}
	 */
	function prop_dev(node, property, value) {
		node[property] = value;
		dispatch_dev('SvelteDOMSetProperty', { node, property, value });
	}

	/**
	 * @returns {void} */
	function validate_slots(name, slot, keys) {
		for (const slot_key of Object.keys(slot)) {
			if (!~keys.indexOf(slot_key)) {
				console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
			}
		}
	}

	/**
	 * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
	 *
	 * Can be used to create strongly typed Svelte components.
	 *
	 * #### Example:
	 *
	 * You have component library on npm called `component-library`, from which
	 * you export a component called `MyComponent`. For Svelte+TypeScript users,
	 * you want to provide typings. Therefore you create a `index.d.ts`:
	 * ```ts
	 * import { SvelteComponent } from "svelte";
	 * export class MyComponent extends SvelteComponent<{foo: string}> {}
	 * ```
	 * Typing this makes it possible for IDEs like VS Code with the Svelte extension
	 * to provide intellisense and to use the component like this in a Svelte file
	 * with TypeScript:
	 * ```svelte
	 * <script lang="ts">
	 * 	import { MyComponent } from "component-library";
	 * </script>
	 * <MyComponent foo={'bar'} />
	 * ```
	 * @template {Record<string, any>} [Props=any]
	 * @template {Record<string, any>} [Events=any]
	 * @template {Record<string, any>} [Slots=any]
	 * @extends {SvelteComponent<Props, Events>}
	 */
	class SvelteComponentDev extends SvelteComponent {
		/**
		 * For type checking capabilities only.
		 * Does not exist at runtime.
		 * ### DO NOT USE!
		 *
		 * @type {Props}
		 */
		$$prop_def;
		/**
		 * For type checking capabilities only.
		 * Does not exist at runtime.
		 * ### DO NOT USE!
		 *
		 * @type {Events}
		 */
		$$events_def;
		/**
		 * For type checking capabilities only.
		 * Does not exist at runtime.
		 * ### DO NOT USE!
		 *
		 * @type {Slots}
		 */
		$$slot_def;

		/** @param {import('./public.js').ComponentConstructorOptions<Props>} options */
		constructor(options) {
			if (!options || (!options.target && !options.$$inline)) {
				throw new Error("'target' is a required option");
			}
			super();
		}

		/** @returns {void} */
		$destroy() {
			super.$destroy();
			this.$destroy = () => {
				console.warn('Component was already destroyed'); // eslint-disable-line no-console
			};
		}

		/** @returns {void} */
		$capture_state() {}

		/** @returns {void} */
		$inject_state() {}
	}

	if (typeof window !== 'undefined')
		// @ts-ignore
		(window.__svelte || (window.__svelte = { v: new Set() })).v.add(PUBLIC_VERSION);

	/* webviews/components/Keploy.svelte generated by Svelte v4.2.17 */
	const file = "webviews/components/Keploy.svelte";

	// (148:16) {:else}
	function create_else_block(ctx) {
		let svg;
		let path0;
		let path1;

		const block = {
			c: function create() {
				svg = svg_element("svg");
				path0 = svg_element("path");
				path1 = svg_element("path");
				attr_dev(path0, "fill", "#ff0000");
				attr_dev(path0, "d", "M12 18c3.31 0 6-2.69 6-6s-2.69-6-6-6s-6 2.69-6 6s2.69 6 6 6");
				attr_dev(path0, "opacity", "0.3");
				add_location(path0, file, 148, 107, 4360);
				attr_dev(path1, "fill", "#ff0000");
				attr_dev(path1, "d", "M12 20c4.42 0 8-3.58 8-8s-3.58-8-8-8s-8 3.58-8 8s3.58 8 8 8m0-14c3.31 0 6 2.69 6 6s-2.69 6-6 6s-6-2.69-6-6s2.69-6 6-6");
				add_location(path1, file, 148, 207, 4460);
				attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
				attr_dev(svg, "width", "35px");
				attr_dev(svg, "height", "35px");
				attr_dev(svg, "viewBox", "0 0 24 24");
				add_location(svg, file, 148, 20, 4273);
			},
			m: function mount(target, anchor) {
				insert_dev(target, svg, anchor);
				append_dev(svg, path0);
				append_dev(svg, path1);
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(svg);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block.name,
			type: "else",
			source: "(148:16) {:else}",
			ctx
		});

		return block;
	}

	// (146:16) {#if isRecording}
	function create_if_block_1(ctx) {
		let svg;
		let path;

		const block = {
			c: function create() {
				svg = svg_element("svg");
				path = svg_element("path");
				attr_dev(path, "fill", "#ff0000");
				attr_dev(path, "d", "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2m0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8s8 3.58 8 8s-3.58 8-8 8m4-4H8V8h8z");
				add_location(path, file, 146, 107, 4061);
				attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
				attr_dev(svg, "width", "35px");
				attr_dev(svg, "height", "35px");
				attr_dev(svg, "viewBox", "0 0 24 24");
				add_location(svg, file, 146, 20, 3974);
			},
			m: function mount(target, anchor) {
				insert_dev(target, svg, anchor);
				append_dev(svg, path);
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(svg);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_1.name,
			type: "if",
			source: "(146:16) {#if isRecording}",
			ctx
		});

		return block;
	}

	// (162:8) {#if selectedIconButton === 1}
	function create_if_block(ctx) {
		let button0;
		let t0;
		let t1;
		let button1;
		let t2;
		let mounted;
		let dispose;

		const block = {
			c: function create() {
				button0 = element("button");
				t0 = text("Start Recording");
				t1 = space();
				button1 = element("button");
				t2 = text("Start Testing");
				attr_dev(button0, "id", "startRecordingButton");
				attr_dev(button0, "class", "button svelte-1myum94");
				button0.disabled = /*isRecording*/ ctx[4];
				add_location(button0, file, 162, 12, 6348);
				attr_dev(button1, "id", "startTestingButton");
				attr_dev(button1, "class", "button svelte-1myum94");
				button1.disabled = /*isRecording*/ ctx[4];
				add_location(button1, file, 165, 12, 6547);
			},
			m: function mount(target, anchor) {
				insert_dev(target, button0, anchor);
				append_dev(button0, t0);
				/*button0_binding*/ ctx[14](button0);
				insert_dev(target, t1, anchor);
				insert_dev(target, button1, anchor);
				append_dev(button1, t2);
				/*button1_binding*/ ctx[15](button1);

				if (!mounted) {
					dispose = listen_dev(button0, "click", /*toggleRecording*/ ctx[8], false, false, false, false);
					mounted = true;
				}
			},
			p: function update(ctx, dirty) {
				if (dirty & /*isRecording*/ 16) {
					prop_dev(button0, "disabled", /*isRecording*/ ctx[4]);
				}

				if (dirty & /*isRecording*/ 16) {
					prop_dev(button1, "disabled", /*isRecording*/ ctx[4]);
				}
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(button0);
					detach_dev(t1);
					detach_dev(button1);
				}

				/*button0_binding*/ ctx[14](null);
				/*button1_binding*/ ctx[15](null);
				mounted = false;
				dispose();
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block.name,
			type: "if",
			source: "(162:8) {#if selectedIconButton === 1}",
			ctx
		});

		return block;
	}

	function create_fragment(ctx) {
		let main;
		let div5;
		let div0;
		let input0;
		let t0;
		let div1;
		let button0;
		let t2;
		let input1;
		let t3;
		let div2;
		let button1;
		let button1_class_value;
		let t4;
		let button2;
		let svg0;
		let path0;
		let button2_class_value;
		let t5;
		let button3;
		let svg1;
		let path1;
		let button3_class_value;
		let t6;
		let hr;
		let t7;
		let h3;
		let t8;
		let div3;
		let t9;
		let t10;
		let div4;
		let t11;
		let button4;
		let mounted;
		let dispose;

		function select_block_type(ctx, dirty) {
			if (/*isRecording*/ ctx[4]) return create_if_block_1;
			return create_else_block;
		}

		let current_block_type = select_block_type(ctx);
		let if_block0 = current_block_type(ctx);
		let if_block1 = /*selectedIconButton*/ ctx[5] === 1 && create_if_block(ctx);

		const block = {
			c: function create() {
				main = element("main");
				div5 = element("div");
				div0 = element("div");
				input0 = element("input");
				t0 = space();
				div1 = element("div");
				button0 = element("button");
				button0.textContent = "Select Project Folder";
				t2 = space();
				input1 = element("input");
				t3 = space();
				div2 = element("div");
				button1 = element("button");
				if_block0.c();
				t4 = space();
				button2 = element("button");
				svg0 = svg_element("svg");
				path0 = svg_element("path");
				t5 = space();
				button3 = element("button");
				svg1 = svg_element("svg");
				path1 = svg_element("path");
				t6 = space();
				hr = element("hr");
				t7 = space();
				h3 = element("h3");
				h3.innerHTML = ``;
				t8 = space();
				div3 = element("div");
				t9 = space();
				if (if_block1) if_block1.c();
				t10 = space();
				div4 = element("div");
				t11 = space();
				button4 = element("button");
				button4.textContent = "Stop Recording";
				attr_dev(input0, "type", "text");
				attr_dev(input0, "id", "recordCommand");
				attr_dev(input0, "name", "recordCommand");
				attr_dev(input0, "placeholder", "Enter App Command");
				attr_dev(input0, "class", "svelte-1myum94");
				add_location(input0, file, 125, 12, 3150);
				attr_dev(div0, "id", "appCommandDiv");
				attr_dev(div0, "class", "svelte-1myum94");
				add_location(div0, file, 124, 8, 3113);
				attr_dev(button0, "id", "selectRecordFolderButton");
				attr_dev(button0, "class", "button svelte-1myum94");
				add_location(button0, file, 134, 12, 3422);
				attr_dev(input1, "type", "text");
				attr_dev(input1, "id", "recordProjectFolder");
				attr_dev(input1, "name", "projectFolder");
				attr_dev(input1, "class", "svelte-1myum94");
				toggle_class(input1, "isVisible", /*isProjectFolderVisible*/ ctx[6]);
				add_location(input1, file, 135, 12, 3518);
				attr_dev(div1, "id", "selectFolderDiv");
				attr_dev(div1, "class", "svelte-1myum94");
				add_location(div1, file, 133, 8, 3383);
				attr_dev(button1, "class", button1_class_value = "icon-button " + (/*selectedIconButton*/ ctx[5] === 1 ? 'selected' : '') + " svelte-1myum94");
				add_location(button1, file, 144, 12, 3813);
				attr_dev(path0, "fill", "#00ff11");
				attr_dev(path0, "d", "M12 5V2.21c0-.45-.54-.67-.85-.35l-3.8 3.79c-.2.2-.2.51 0 .71l3.79 3.79c.32.31.86.09.86-.36V7c3.73 0 6.68 3.42 5.86 7.29c-.47 2.27-2.31 4.1-4.57 4.57c-3.57.75-6.75-1.7-7.23-5.01a1 1 0 0 0-.98-.85c-.6 0-1.08.53-1 1.13c.62 4.39 4.8 7.64 9.53 6.72c3.12-.61 5.63-3.12 6.24-6.24C20.84 9.48 16.94 5 12 5");
				add_location(path0, file, 152, 103, 4877);
				attr_dev(svg0, "xmlns", "http://www.w3.org/2000/svg");
				attr_dev(svg0, "width", "35px");
				attr_dev(svg0, "height", "35px");
				attr_dev(svg0, "viewBox", "0 0 24 24");
				add_location(svg0, file, 152, 16, 4790);
				attr_dev(button2, "class", button2_class_value = "icon-button " + (/*selectedIconButton*/ ctx[5] === 2 ? 'selected' : '') + " svelte-1myum94");
				add_location(button2, file, 151, 12, 4667);
				attr_dev(path1, "fill", "#f56e00");
				attr_dev(path1, "d", "M19.14 12.94c.04-.3.06-.61.06-.94c0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6s3.6 1.62 3.6 3.6s-1.62 3.6-3.6 3.6");
				add_location(path1, file, 155, 103, 5451);
				attr_dev(svg1, "xmlns", "http://www.w3.org/2000/svg");
				attr_dev(svg1, "width", "35px");
				attr_dev(svg1, "height", "35px");
				attr_dev(svg1, "viewBox", "0 0 24 24");
				add_location(svg1, file, 155, 16, 5364);
				attr_dev(button3, "class", button3_class_value = "icon-button " + (/*selectedIconButton*/ ctx[5] === 3 ? 'selected' : '') + " svelte-1myum94");
				add_location(button3, file, 154, 12, 5241);
				attr_dev(div2, "class", "icon-buttons svelte-1myum94");
				add_location(div2, file, 143, 8, 3774);
				add_location(hr, file, 158, 8, 6211);
				attr_dev(h3, "id", "recordStatus");
				attr_dev(h3, "class", "svelte-1myum94");
				add_location(h3, file, 159, 8, 6225);
				attr_dev(div3, "id", "recordedTestCases");
				attr_dev(div3, "class", "svelte-1myum94");
				add_location(div3, file, 160, 8, 6262);
				attr_dev(div4, "class", "loader svelte-1myum94");
				attr_dev(div4, "id", "loader");
				add_location(div4, file, 167, 8, 6693);
				attr_dev(button4, "id", "stopRecordingButton");
				attr_dev(button4, "class", "svelte-1myum94");
				add_location(button4, file, 168, 8, 6740);
				attr_dev(div5, "class", "menu");
				add_location(div5, file, 123, 4, 3086);
				attr_dev(main, "class", "svelte-1myum94");
				add_location(main, file, 122, 0, 3075);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, main, anchor);
				append_dev(main, div5);
				append_dev(div5, div0);
				append_dev(div0, input0);
				set_input_value(input0, /*appCommand*/ ctx[0]);
				append_dev(div5, t0);
				append_dev(div5, div1);
				append_dev(div1, button0);
				append_dev(div1, t2);
				append_dev(div1, input1);
				/*input1_binding*/ ctx[10](input1);
				append_dev(div5, t3);
				append_dev(div5, div2);
				append_dev(div2, button1);
				if_block0.m(button1, null);
				append_dev(div2, t4);
				append_dev(div2, button2);
				append_dev(button2, svg0);
				append_dev(svg0, path0);
				append_dev(div2, t5);
				append_dev(div2, button3);
				append_dev(button3, svg1);
				append_dev(svg1, path1);
				append_dev(div5, t6);
				append_dev(div5, hr);
				append_dev(div5, t7);
				append_dev(div5, h3);
				append_dev(div5, t8);
				append_dev(div5, div3);
				append_dev(div5, t9);
				if (if_block1) if_block1.m(div5, null);
				append_dev(div5, t10);
				append_dev(div5, div4);
				append_dev(div5, t11);
				append_dev(div5, button4);

				if (!mounted) {
					dispose = [
						listen_dev(input0, "input", /*input0_input_handler*/ ctx[9]),
						listen_dev(button1, "click", /*click_handler*/ ctx[11], false, false, false, false),
						listen_dev(button2, "click", /*click_handler_1*/ ctx[12], false, false, false, false),
						listen_dev(button3, "click", /*click_handler_2*/ ctx[13], false, false, false, false),
						listen_dev(button4, "click", /*toggleRecording*/ ctx[8], false, false, false, false)
					];

					mounted = true;
				}
			},
			p: function update(ctx, [dirty]) {
				if (dirty & /*appCommand*/ 1 && input0.value !== /*appCommand*/ ctx[0]) {
					set_input_value(input0, /*appCommand*/ ctx[0]);
				}

				if (dirty & /*isProjectFolderVisible*/ 64) {
					toggle_class(input1, "isVisible", /*isProjectFolderVisible*/ ctx[6]);
				}

				if (current_block_type !== (current_block_type = select_block_type(ctx))) {
					if_block0.d(1);
					if_block0 = current_block_type(ctx);

					if (if_block0) {
						if_block0.c();
						if_block0.m(button1, null);
					}
				}

				if (dirty & /*selectedIconButton*/ 32 && button1_class_value !== (button1_class_value = "icon-button " + (/*selectedIconButton*/ ctx[5] === 1 ? 'selected' : '') + " svelte-1myum94")) {
					attr_dev(button1, "class", button1_class_value);
				}

				if (dirty & /*selectedIconButton*/ 32 && button2_class_value !== (button2_class_value = "icon-button " + (/*selectedIconButton*/ ctx[5] === 2 ? 'selected' : '') + " svelte-1myum94")) {
					attr_dev(button2, "class", button2_class_value);
				}

				if (dirty & /*selectedIconButton*/ 32 && button3_class_value !== (button3_class_value = "icon-button " + (/*selectedIconButton*/ ctx[5] === 3 ? 'selected' : '') + " svelte-1myum94")) {
					attr_dev(button3, "class", button3_class_value);
				}

				if (/*selectedIconButton*/ ctx[5] === 1) {
					if (if_block1) {
						if_block1.p(ctx, dirty);
					} else {
						if_block1 = create_if_block(ctx);
						if_block1.c();
						if_block1.m(div5, t10);
					}
				} else if (if_block1) {
					if_block1.d(1);
					if_block1 = null;
				}
			},
			i: noop,
			o: noop,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(main);
				}

				/*input1_binding*/ ctx[10](null);
				if_block0.d();
				if (if_block1) if_block1.d();
				mounted = false;
				run_all(dispose);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('Keploy', slots, []);
		let appCommand = '';
		let startTestingButton;
		let startRecordingButton;
		let recordProjectFolder;
		let selectedIconButton = 1;
		let isProjectFolderVisible = false;
		let isRecording = false;

		const selectButton = buttonNumber => {
			$$invalidate(5, selectedIconButton = buttonNumber);
		};

		const toggleRecording = () => {
			$$invalidate(4, isRecording = !isRecording);
		};

		const writable_props = [];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Keploy> was created with unknown prop '${key}'`);
		});

		function input0_input_handler() {
			appCommand = this.value;
			$$invalidate(0, appCommand);
		}

		function input1_binding($$value) {
			binding_callbacks[$$value ? 'unshift' : 'push'](() => {
				recordProjectFolder = $$value;
				$$invalidate(3, recordProjectFolder);
			});
		}

		const click_handler = () => selectButton(1);
		const click_handler_1 = () => selectButton(2);
		const click_handler_2 = () => selectButton(3);

		function button0_binding($$value) {
			binding_callbacks[$$value ? 'unshift' : 'push'](() => {
				startRecordingButton = $$value;
				((($$invalidate(2, startRecordingButton), $$invalidate(0, appCommand)), $$invalidate(1, startTestingButton)), $$invalidate(4, isRecording));
			});
		}

		function button1_binding($$value) {
			binding_callbacks[$$value ? 'unshift' : 'push'](() => {
				startTestingButton = $$value;
				((($$invalidate(1, startTestingButton), $$invalidate(0, appCommand)), $$invalidate(2, startRecordingButton)), $$invalidate(4, isRecording));
			});
		}

		$$self.$capture_state = () => ({
			appCommand,
			startTestingButton,
			startRecordingButton,
			recordProjectFolder,
			selectedIconButton,
			isProjectFolderVisible,
			isRecording,
			selectButton,
			toggleRecording
		});

		$$self.$inject_state = $$props => {
			if ('appCommand' in $$props) $$invalidate(0, appCommand = $$props.appCommand);
			if ('startTestingButton' in $$props) $$invalidate(1, startTestingButton = $$props.startTestingButton);
			if ('startRecordingButton' in $$props) $$invalidate(2, startRecordingButton = $$props.startRecordingButton);
			if ('recordProjectFolder' in $$props) $$invalidate(3, recordProjectFolder = $$props.recordProjectFolder);
			if ('selectedIconButton' in $$props) $$invalidate(5, selectedIconButton = $$props.selectedIconButton);
			if ('isProjectFolderVisible' in $$props) $$invalidate(6, isProjectFolderVisible = $$props.isProjectFolderVisible);
			if ('isRecording' in $$props) $$invalidate(4, isRecording = $$props.isRecording);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		$$self.$$.update = () => {
			if ($$self.$$.dirty & /*appCommand, startTestingButton, startRecordingButton, isRecording*/ 23) {
				{
					const isAppCommandEmpty = appCommand.trim() === '';
					if (startTestingButton) $$invalidate(1, startTestingButton.disabled = isAppCommandEmpty, startTestingButton);
					if (startRecordingButton) $$invalidate(2, startRecordingButton.disabled = isAppCommandEmpty, startRecordingButton);

					//set visibility of stop recording button
					const stopRecordingButton = document.getElementById('stopRecordingButton');

					if (stopRecordingButton) {
						stopRecordingButton.style.display = isRecording ? 'block' : 'none';
					}

					const loader = document.getElementById('loader');

					if (loader) {
						loader.style.display = isRecording ? 'block' : 'none';
					}

					//set visibility of start recording button and start testing button
					if (startRecordingButton) {
						$$invalidate(2, startRecordingButton.style.display = isRecording ? 'none' : 'block', startRecordingButton);
					}

					if (startTestingButton) {
						$$invalidate(1, startTestingButton.style.display = isRecording ? 'none' : 'block', startTestingButton);
					}
				}
			}

			if ($$self.$$.dirty & /*recordProjectFolder*/ 8) {
				$$invalidate(6, isProjectFolderVisible = recordProjectFolder?.value.trim() !== '');
			}
		};

		return [
			appCommand,
			startTestingButton,
			startRecordingButton,
			recordProjectFolder,
			isRecording,
			selectedIconButton,
			isProjectFolderVisible,
			selectButton,
			toggleRecording,
			input0_input_handler,
			input1_binding,
			click_handler,
			click_handler_1,
			click_handler_2,
			button0_binding,
			button1_binding
		];
	}

	class Keploy extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance, create_fragment, safe_not_equal, {});

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "Keploy",
				options,
				id: create_fragment.name
			});
		}
	}

	const app = new Keploy({
	    target: document.body,
	});

	return app;

})();
//# sourceMappingURL=Keploy.js.map
