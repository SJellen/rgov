/* global window, document, fetch, setTimeout */
// @ts-check

import htm from 'htm';
import m from 'mithril';
import { getEthProvider } from 'rchain-api';
import { unwrap, buildUI, makeBusy, ckControl } from './participate';

// WARNING: ambient access
document.addEventListener('DOMContentLoaded', () => {
  /** @type {(selector: string) => HTMLElement} */
  const $ = (selector) => unwrap(document.querySelector(selector));

  const html = htm.bind(m);

  buildUI({
    html,
    busy: makeBusy($, m.redraw),
    formValue: (selector) => ckControl($(selector)).value,
    fetch,
    setTimeout,
    clock: () => Promise.resolve(Date.now()),
    getEthProvider: () => getEthProvider({ window }),
    mount: (selector, control) => m.mount($(selector), control),
    hostname: document.location.hostname,
  });
});
