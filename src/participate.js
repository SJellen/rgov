/* eslint-disable no-use-before-define */
/* eslint-disable no-shadow */
/* global HTMLInputElement, HTMLSelectElement, HTMLTextAreaElement, HTMLButtonElement */
// @ts-check
import {
  RNode,
  RhoExpr,
  MetaMaskAccount,
  getAddrFromEth,
  signMetaMask,
  startTerm,
  listenAtDeployId,
} from 'rchain-api';
import { actions } from './actions.js';

// TODO(#185): stop pretending MasterURI is a design-time constant.
// Meanwhile, see bootstrap/deploy-all for MasterURI.localhost.json
// and to tsc and eslint, we say "please excuse me" as follows:
// @ts-ignore
// eslint-disable-next-line import/no-unresolved
import { localhostNETWORK } from './MasterURI.localhost.json';
import { mainnetNETWORK } from './MasterURI.mainnet.json';
import { testnetNETWORK } from './MasterURI.testnet.json';
import { rhobotNETWORK } from './MasterURI.rhobot.json';
import { demoNETWORK } from './MasterURI.demo.json';

const { freeze, keys, entries, fromEntries } = Object;

// TODO: UI for phloLimit
const maxFee = { phloPrice: 1, phloLimit: 0.05 * 100000000 };

// TODO: ISSUE: are networks really const? i.e. design-time data?
const NETWORKS = {
  localhost: {
    hostPattern: 'localhost',
    observerBase: 'http://localhost:40403',
    validatorBase: 'http://localhost:40403',
    adminBase: 'http://localhost:40405',
    MasterURI: localhostNETWORK.MasterURI,
  },
  testnet: {
    hostPattern: 'test',
    observerBase: 'https://observer.testnet.rchain.coop',
    // TODO: rotate validators
    validatorBase: 'https://node0.testnet.rchain-dev.tk',
    adminBase: '',
    MasterURI: testnetNETWORK.MasterURI,
  },
  demo: {
    hostPattern: 'demo',
    observerBase: 'https://demoapi.rhobot.net',
    // TODO: rotate validators
    validatorBase: 'https://demoapi.rhobot.net',
    adminBase: 'https://demoadmin.rhobot.net',
    MasterURI: demoNETWORK.MasterURI,
  },
  rhobot: {
    hostPattern: 'rhobot',
    observerBase: 'https://rnodeapi.rhobot.net',
    // TODO: rotate validators
    validatorBase: 'https://rnodeapi.rhobot.net',
    adminBase: 'https://rnodeadmin.rhobot.net',
    MasterURI: rhobotNETWORK.MasterURI,
  },
  mainnet: {
    observerBase: 'https://observer.services.mainnet.rchain.coop',
    validatorBase: 'https://node12.root-shard.mainnet.rchain.coop',
    adminBase: '',
    MasterURI: mainnetNETWORK.MasterURI,
  },
};
/**
 * @param {string} hostname
 * @returns {string}
 */
function netFromHost(hostname) {
  return (Object.entries(NETWORKS).find(
    ([_name, { hostPattern }]) => hostname.indexOf(hostPattern) >= 0,
  ) || ['mainnet'])[0];
}

// rnode.js:63 POST https://observer.services.mainnet.rchain.coop/api/explore-deploy 400 (Bad Request)
// rnode.js:73 Uncaught (in promise) Error: File write failed: No space left on device
const ROLL = `11112fZEixuoKqrGH6BxAPayFD8LWq9KRVFwcLvA5gg6GAaNEZvcKL
11112PaJTzAUqVkfpyjUJpk2XWKS2QMtFfFE5iWq62vGRUaEH1ZcXj
11112UccvordMtYMk3ALmZJRhCrjHsnxh52b2wqcDexQ63xoZAjVZF
11112JXatAMBStxF79MbUyY9AbkiCjHFx2DAjwXvqVpQ3Yk24YQEDC
1111mQx7bW17rJwKeYnUWAB4fN3yA1bTH4U6obRDH7dyv8mGvXSQz
11112PNUTSEf1Gujfj4u415KQLy8S3NTWYW6QxdjDAK5Hj4RbHrMti
11112hh67Rr4BVevdLYy46TKSASeapfCgeWWZpB5v7nf6agCK3tHF4
1111J5bVLwMGNroxr9DCQguJnzWR74o4H6Tb4rakexoHSzZcow47r
1111ye6MaahuvJfzUofP1bA5K5BxXD6Vbo6bi3HfaJnJaFq6mUpxB
1111NLmTJyXbHqALwGJxz73DSXtuzXLoBqg6pzBvEVLWjdzBYaYCG
1111229Y7xRnTRPMqbbXVyzAEVvAA1ikBvZNP3crck2Vji1dNpKbvH
1111Fk3FQgPGCozndA28Kkkpk34Z4hAen8uAfsLhGw5JnXG8TtdZU
111128XWevfc8z89JzxnwqPR9ive6uwBGCeo72p8TKqT8wRoy6ZgLo
11112AQiVPXmASU2SGnS2qCQN5p3QyEcp2mZTYn5KmNwEKEswfuRp2
`
  .trim()
  .split('\n');

let deployId = '';

/**
 * TODO: expect rather than unwrap (better diagnostics)
 *
 * @param {T?} x
 * @returns {T}
 * @template T
 */
export function unwrap(x) {
  if (!x) throw new TypeError('unexpected null / undefined');
  return x;
}

/**
 * @typedef {{
 *   formValue: (selector: string) => string,
 *   busy: (selector: string, p: Promise<T>) => Promise<T>,
 * }} FormAccess
 * @template T
 */

/**
 * @param {(selector: string) => HTMLElement} $
 * @param { () => void } redraw
 */
export function makeBusy($, redraw) {
  /**
   * @param {string} selector
   * @param {Promise<T>} p
   * @returns {Promise<T>}
   *
   * @template T
   */
  async function busy(selector, p) {
    $('form').style.cursor = 'wait';
    const button = $(selector);
    if (!(button instanceof HTMLButtonElement)) throw TypeError(String(button));
    button.style.cursor = 'wait';
    button.disabled = true;

    try {
      const result = await p;
      return result;
    } finally {
      button.disabled = false;
      $('form').style.cursor = 'inherit';
      button.style.cursor = 'inherit';
      redraw();
    }
  }
  return busy;
}

/**
 * @param {string} tmp
 * @returns { string }
 */
function rhoBody(tmp) {
  const newPos = tmp.indexOf('new');
  const endPos = tmp.lastIndexOf('}', tmp.lastIndexOf('}'));
  const content = tmp.substring(newPos, endPos - 1);
  return content;
}

/**
 * @param { HTMLBuilder & EthSignAccess & MithrilMount & WebAccess & FormAccess<any> & ScheduleAccess & {
 *  hostname: string }} io
 * @typedef {import('./actions').FieldSpec} FieldSpec
 *
 * @typedef {{
 *   fetch: typeof fetch
 * }} WebAccess
 *
 *
 * @typedef {{
 *   html: any, // TODO: htm(m) type
 * }} HTMLBuilder
 *
 * @typedef {{
 *   mount: (selector: string, component: import('mithril').Component) => void,
 * }} MithrilMount
 * @typedef {{
 *   getEthProvider: () => Promise<MetaMaskProvider>
 * }} EthSignAccess
 *
 * @typedef {{
 *   clock: () => Promise<number>,
 *   setTimeout: typeof setTimeout,
 * }} ScheduleAccess
 *
 * @typedef { import('rchain-api/src/ethProvider').MetaMaskProvider } MetaMaskProvider
 */
export function buildUI({
  html,
  formValue,
  busy,
  clock,
  setTimeout,
  getEthProvider,
  mount,
  fetch,
  hostname,
}) {
  const rnode = RNode(fetch);
  let action = '_select_an_action_';
  let network = netFromHost(hostname);
  /** @type {{ MasterURI: string, observer: Observer, validator: Validator, admin: import('rchain-api/src/rnode').RNodeAdmin }} shard */
  let shard;
  let matchBody = '';
  /** @type {string?} */
  let term = '';
  /** @type {Record<string, string>} */
  let fieldValues = {};
  /** @type {RhoExpr[]} */
  let results = [];
  const bindings = {
    mainnet: {},
    localhost: { $roll: ROLL },
    testnet: {},
    demo: {},
    rhobot: {},
  };

  const state = {
    get shard() {
      return shard;
    },
    get network() {
      return network;
    },
    set network(value) {
      const net = NETWORKS[value];
      if (!net) return;
      network = value;
      console.log({ network, net });
      shard = {
        observer: rnode.observer(net.observerBase),
        validator: rnode.validator(net.validatorBase),
        admin: rnode.admin(net.adminBase),
        MasterURI: net.MasterURI,
      };
      state.bindings = bindings[network];
    },
    get action() {
      return action;
    },
    /** @param { string } value */
    async setAction(value) {
      if (typeof value !== 'string') return;
      action = value;
      const { fields = {}, filename } = actions[action];
      const init = fromEntries(
        entries(fields).map(([name, { value }]) => [name, value || '']),
      );
      state.fields = init;
      matchBody = '';
      if (filename) {
        term = null;
        await busy(
          '#deploy',
          fetch(filename).then((reply) =>
            reply.text().then((text) => {
              matchBody = rhoBody(text);
              state.fields = init; // redraw
            }),
          ),
        );
      }
    },
    get fields() {
      return fieldValues;
    },
    set fields(/** @type {Record<string, string>} */ value) {
      const { fields = {} } = actions[state.action];
      if (fields) {
        fieldValues = fromEntries(keys(fields).map((k) => [k, value[k] || '']));
        const exprs = entries(fieldValues).map(([name, value]) => {
          if (fields[name].type === 'uri') {
            return `\`${value.trim()}\``;
          } else if (fields[name].type === 'set') {
            return `Set(${value})`;
          } else if (fields[name].type === 'number') {
            return value;
          } else if (fields[name].type === 'MasterURI') {
            return state.shard.MasterURI;
          } else {
            return JSON.stringify(value);
          }
          // fields[name].type === 'uri' ? `\`${value}\`` : JSON.stringify(value),
        });
        state.term = `match [${exprs.join(', ')}] {
          [${keys(fieldValues).join(', ')}] => {
            ${matchBody}
          }
        }`;
      } else {
        fieldValues = {};
        state.term = matchBody;
      }
    },
    get term() {
      return term;
    },
    set term(value) {
      term = fixIndent(value);
      state.results = [];
      state.problem = undefined;
    },
    bindings: bindings[network],
    get results() {
      return results;
    },
    set results(/** @type {RhoExpr[]} */ value) {
      results = value;
      results.forEach((expr) => {
        const decl = RhoExpr.parse(expr);
        if (Array.isArray(decl)) {
          const [kw, name, rhs] = decl;
          if (kw !== '#define') return;
          if (typeof name !== 'string') return;
          state.bindings[name] = rhs;
        }
      });
    },
    problem: undefined,
  };
  state.setAction(action); // compute initial term
  state.network = network; // set up shard of initial network

  mount('#actionControl', actionControl(state, { html, getEthProvider }));
  mount('#netControl', networkControl(state, { html }));

  mount(
    '#runControl',
    runControl(state, {
      html,
      formValue,
      busy,
      clock,
      getEthProvider,
      setTimeout,
    }),
  );
  mount('#groupControl', groupControl(state, { html }));
}

/**
 * @param {unknown} ctrl
 * @returns {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement}
 */
export function ckControl(ctrl) {
  if (
    !(ctrl instanceof HTMLInputElement) &&
    !(ctrl instanceof HTMLSelectElement) &&
    !(ctrl instanceof HTMLTextAreaElement)
  )
    throw TypeError(String(ctrl));
  return ctrl;
}

function fixIndent(code) {
  const lines = code.split('\n').map((l) => l.trim());
  let level = 0;
  for (let ix = 0; ix < lines.length; ix += 1) {
    if (lines[ix].startsWith('}')) {
      level -= 1;
    }
    if (level > 0) {
      lines[ix] = '  '.repeat(level) + lines[ix];
    }
    if (lines[ix].endsWith('{')) {
      level += 1;
    }
  }
  return lines.join('\n');
}

/**
 * @param {{
 *   action: string,
 *   setAction: (a: string) => Promise<void>,
 *   fields: Record<string, string>,
 *   term: string?,
 *   shard: { MasterURI: string },
 * }} state
 * @param {HTMLBuilder & EthSignAccess} io
 */
function actionControl(state, { html, getEthProvider }) {
  const options = (/** @type {string[]} */ ids) =>
    ids.map(
      (id) =>
        html`<option value=${id} ...${{ selected: id === state.action }}>
          ${id}
        </option>`,
    );

  const metaMaskP = getEthProvider().then((ethereum) =>
    MetaMaskAccount(ethereum),
  );

  const fty = (action, name) => {
    const f = actions[action].fields;
    if (!f || !f[name]) return 'string';
    return f[name].type;
  };

  const connectButton = (name) => html`<button
    onclick=${(/** @type {Event} */ _event) => {
      metaMaskP.then((mm) =>
        mm.ethereumAddress().then((ethAddr) => {
          const revAddr = getAddrFromEth(ethAddr);
          if (!revAddr) throw new Error('bad ethAddr???');
          const current = { [name]: revAddr };
          const old = state.fields;
          state.fields = { ...old, ...current };
        }),
      );
      return false;
    }}
  >
    Connect Wallet
  </button>`;

  const fieldControls = (
    /** @type {string} */ action,
    /** @type {Record<string, string>} */ fields,
  ) => {
    const fragment = entries(fields).map(
      ([name, value]) =>
        html`<div id=${`${action}.${name}`}>
          <label
            >${name}:
            <input
              name=${name}
              disabled=${fty(action, name) === 'MasterURI'}
              value=${fty(action, name) === 'MasterURI'
                ? state.shard.MasterURI
                : value}
              onchange=${(/** @type {Event} */ event) => {
                const current = { [name]: ckControl(event.target).value };
                const old = state.fields;
                state.fields = { ...old, ...current };
                return false;
              }}
          /></label>
          ${fty(action, name) === 'walletRevAddr' ? connectButton(name) : ''}
        </div>`,
    );
    return fragment;
  };

  return freeze({
    view() {
      return html`
        <label
          >Action:
          <select
            name="action"
            onchange=${(/** @type {Event} */ event) => {
              state.setAction(ckControl(event.target).value);
              deployId = '';
              return false;
            }}
          >
            ${options(keys(actions))}
          </select>
        </label>
        <div class="fields">${fieldControls(state.action, state.fields)}</div>
        <textarea
          cols="80"
          rows="16"
          onchange=${(event) => {
            state.term = ckControl(event.target).value;
          }}
        >
${state.term || ''}</textarea
        >
      `;
    },
  });
}

/**
 * @param {{
 *   shard: { observer: Observer, validator: Validator, admin: import('rchain-api/src/rnode').RNodeAdmin },
 *   term: string?,
 *   results: RhoExpr[],
 *   problem?: string,
 *   action: any
 * }} state
 * @param {HTMLBuilder & FormAccess<any> & EthSignAccess & ScheduleAccess} io
 *
 * @param { number } period
 *
 * @typedef {import('rchain-api').RhoExpr} RhoExpr
 * @typedef {import('rchain-api').Observer} Observer
 * @typedef {import('rchain-api').Validator} Validator
 * @typedef {import('rchain-api').DeployData} DeployData
 */
function runControl(
  state,
  { html, busy, getEthProvider, clock, setTimeout },
  period = 5 * 1000,
) {
  const hide = (/** @type { boolean } */ flag) =>
    flag ? { style: 'display: none' } : {};

  const pprint = (obj) => JSON.stringify(obj, null, 2);

  async function explore(/** @type {string?} */ term) {
    if (!term) {
      return;
    }
    const obs = state.shard.observer;
    state.problem = undefined;
    state.results = [];
    try {
      console.log('explore...');
      const { expr, _block } = await busy(
        '#explore',
        obs.exploratoryDeploy(term),
      );
      console.log('... explore done.');
      state.results = expr;
      // TODO? $('#blockInfo').textContent = pprint(block);
    } catch (err) {
      state.problem = err.message;
    }
  }

  let proposeCount = 0;
  async function propose() {
    proposeCount += 1;
    const adm = state.shard.admin;
    adm
      .propose()
      .then((x) => {
        console.log(x);
        proposeCount = 0;
      })
      .catch((err) => {
        console.log(proposeCount, err);
        if (proposeCount < 7) {
          setTimeout(propose, 10000);
        }
      });
  }

  async function deploy(/** @type {string?} */ term) {
    if (!term) {
      return;
    }
    const obs = state.shard.observer;
    const val = state.shard.validator;
    state.problem = undefined;
    state.results = [];
    const account = freeze({
      polling: () =>
        // TODO: UI to cancel
        new Promise((resolve) => {
          setTimeout(resolve, period);
        }),
      async sign(/** @type { string } */ term) {
        const [timestamp, [recent]] = await Promise.all([
          clock(),
          obs.getBlocks(1),
        ]);
        const ethereum = await getEthProvider();
        return signMetaMask(
          {
            term,
            ...maxFee,
            timestamp,
            validAfterBlockNumber: recent.blockNumber,
          },
          ethereum,
        );
      },
    });

    try {
      await busy(
        '#deploy',
        (async () => {
          console.log('@@DEBUG', state.action, { 'log message': 'string' });
          setTimeout(propose, 10000);
          console.log('@@DEBUG', state.action, { 'log message': 'propose' });
          const deploy = await startTerm(term, val, obs, account);
          console.log('@@DEBUG', state.action, { deploy });
          deployId = deploy.sig;
          const { expr } = await listenAtDeployId(obs, deploy);
          console.log('@@DEBUG', state.action, { expr });
          state.results = [expr];
        })(),
      );
      // TODO? $('#blockInfo').textContent = pprint(block);
    } catch (err) {
      state.problem = err.message;
    }
  }

  return freeze({
    view() {
      return html`<button
          id="explore"
          disabled=${state.term === null}
          onclick=${async (/** @type {Event} */ event) => {
            event.preventDefault();
            explore(state.term);
          }}
        >
          Explore
        </button>
        <button
          id="deploy"
          disabled=${state.term === null}
          onclick=${async (/** @type {Event} */ event) => {
            event.preventDefault();
            deploy(state.term);
          }}
        >
          Deploy
        </button>
        <section id="resultSection" ...${hide(!state.results)}>
          <h2>Result</h2>
          <pre id="deployId"> ${deployId} </pre>
          <pre id="result">
${state.results ? pprint(state.results.map(RhoExpr.parse)) : ''}</pre
          >
          <!-- TODO
          <h2>Block Info</h2>
          <small>
            <pre id="blockInfo"></pre>
          </small>
          -->
        </section>
        <section id="problemSection" ...${hide(!state.problem)}>
          <h3>Problem</h3>
          <pre id="problem">${state.problem ? state.problem : ''}</pre>
        </section>`;
    },
  });
}

function networkControl(state, { html }) {
  return freeze({
    view() {
      return html`<div id="netControl">
        Network:
        <select
          id="netControlSelect"
          value=${state.network}
          onchange=${(event) => (state.network = ckControl(event.target).value)}
        >
          ${keys(NETWORKS).map(
            (network) =>
              html`<option ...${{ name: 'network', value: network }}>
                ${network}
              </option>`,
          )}
        </select>
      </div>`;
    },
  });
}

/**
 * @param {{ action: string, fields: Record<string, string>, bindings: Record<string, unknown> }} state
 * @param {HTMLBuilder} io
 * @typedef { string } RevAddress
 */
function groupControl(state, { html }) {
  const score = (/** @type { string } */ revAddr) => {
    const kudos = state.bindings.$kudos;
    if (typeof kudos !== 'object' || !kudos) return 0;
    const score = kudos[revAddr];
    if (typeof score !== 'number') return 0;
    return score;
  };
  const nick = (/** @type { string } */ revAddr) => revAddr.slice(5, 15);
  const avatar = (/** @type { string } */ revAddr) =>
    `https://robohash.org/${revAddr}?size=64x64;set=set3`;

  return freeze({
    view() {
      const roll = state.bindings.$roll;
      if (!Array.isArray(roll)) return html``;
      return html` <h3>Members</h3>
        <div>
          ${roll.map(
            (revAddr) =>
              html`
                <div
                  id="${revAddr}"
                  data-revAddr=${revAddr}
                  class="card avatar"
                >
                  <img valign="middle" src=${avatar(revAddr)} />
                  <button
                    class="like"
                    onclick=${() => {
                      state.action = 'awardKudos';
                      state.fields = { ...state.fields, them: revAddr };
                    }}
                  >
                    ❤️ ${score(revAddr) || ''}
                  </button>
                  <br />
                  <strong class="name">${nick(revAddr)}</strong>
                </div>
              `,
          )}
        </div>`;
    },
  });
}
