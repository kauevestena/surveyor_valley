// The opening dialog: what the game is, how to move, and the choices that shape
// the run — who you are, the language, the difficulty, and the world seed.
//
// The language toggle lives here because the brief asks for it here, and
// because it is the one setting a student must be able to find before they can
// read anything else.
//
// The surveyor's own name and face live here for a less obvious reason: the
// name signs the planta and the memorial descritivo, and until this panel
// existed it was initialised empty and never assigned, so every document a
// student produced was signed "Surveyor Valley". A generated name means the
// field is never blank, and the sprite preview means the choice is visible
// rather than a row of abstract swatches.

import { el } from './dom.js';
import { t, num, setLanguage, lang, availableLanguages, applyI18n } from './i18n.js';
import { randomSeed, makeRng } from '../core/rng.js';
import { DIFFICULTY } from '../core/state.js';
import { SKIN_TONES, HAIR_TONES, HAT_STYLES, DEFAULT_LOOK } from '../render/palette.js';
import { paintSurveyor, HEAD, BUST, MINI } from './portrait.js';
import { randomSurveyorName } from '../world/names.js';

const KEYBOARD_CONTROLS = [
  ['intro.moveKeys', 'intro.moveDesc'],
  ['intro.runKeys', 'intro.runDesc'],
  ['intro.mouseKeys', 'intro.mouseDesc'],
  ['intro.rightDragKeys', 'intro.rightDragDesc'],
  ['intro.toolKeys', 'intro.toolDesc'],
  ['intro.spaceKeys', 'intro.spaceDesc'],
  ['intro.batchKeys', 'intro.batchDesc'],
  ['intro.dblClickKeys', 'intro.dblClickDesc'],
  ['intro.escKeys', 'intro.escDesc'],
];

/**
 * On a touchscreen the keyboard list is not merely incomplete, it is wrong: the
 * first thing it tells a tablet user is to press W. These rows lead when the
 * pointer is coarse, and the keyboard rows stay underneath because a tablet
 * with a keyboard case is a real thing.
 */
const TOUCH_CONTROLS = [
  ['intro.stickKeys', 'intro.stickDesc'],
  ['intro.tapKeys', 'intro.tapDesc'],
  ['intro.pinchKeys', 'intro.pinchDesc'],
  ['intro.twoFingerKeys', 'intro.twoFingerDesc'],
  ['intro.doubleTapKeys', 'intro.doubleTapDesc'],
];

const isTouch = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const CONTROLS = () => (isTouch() ? [...TOUCH_CONTROLS, ...KEYBOARD_CONTROLS] : KEYBOARD_CONTROLS);

/**
 * @param {object} p
 * @param {object} p.modals
 * @param {(opts:{seed:string, difficulty:string}) => void} p.onStart
 * @param {() => void} [p.onContinue]  present only when a save can be resumed
 * @param {{done:number, money:number}} [p.saved]  what that save contains
 */
export function showIntro({ modals, onStart, onContinue = null, saved = null, initial = {} }) {
  let seed = initial.seed || randomSeed();
  let difficulty = initial.difficulty || 'medio';

  const look = { ...DEFAULT_LOOK, ...(initial.look || {}) };
  /** True once the player has typed over the generated name. */
  let nameEdited = Boolean(initial.name);
  let name = initial.name || rollName(look.body);

  // ---- who you are --------------------------------------------------------

  const preview = el('canvas.char-preview', { width: 24 * 4, height: 34 * 4 });
  const paintPreview = () => paintSurveyor(preview, look);

  const nameInput = el('input.name-input', {
    type: 'text',
    value: name,
    maxlength: '40',
    spellcheck: 'false',
    'aria-label': t('intro.nameTitle'),
    oninput: (ev) => {
      name = ev.target.value;
      nameEdited = true;
    },
  });

  function rollName(body) {
    return randomSurveyorName(makeRng(String(Math.random()), 'surveyor'), body);
  }

  function setName(next) {
    name = next;
    nameInput.value = next;
  }

  /**
   * A row of choices over one of the palette tables, each drawn as the surveyor
   * it would produce.
   *
   * Every miniature paints the CURRENT look with only its own dimension varied,
   * so picking a hat repaints the skin and hair rows wearing it. That is what
   * makes the panel a paper doll rather than a legend: a flat colour square
   * answers "what colour is this" when the question is "what would I look
   * like". Sixteen 24x34 paints is about thirteen thousand pixels, which is
   * nothing, and it buys the one thing a row of squares cannot show — how the
   * pieces sit together.
   */
  function chooser(className, items, key, crop) {
    const row = el('div.swatch-row', { role: 'radiogroup', 'aria-label': t(`intro.${key}Title`) });
    const canvases = [];

    items.forEach((item, i) => {
      const face = el('canvas.swatch-face', {
        width: crop.w * MINI,
        height: crop.h * MINI,
        'aria-hidden': 'true',
      });
      canvases.push({ face, value: i });
      row.append(
        el(
          `button.swatch.${className}${i === look[key] ? '.is-active' : ''}`,
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(i === look[key]),
            // A canvas has no accessible name of its own, so the label is the
            // only thing a screen reader has left once the text is gone.
            'aria-label': t(`look.${key}.${item.id}`),
            title: t(`look.${key}.${item.id}`),
            dataset: { index: String(i) },
            onclick: () => {
              look[key] = i;
              // Choosing a skin tone also picks the hair that goes with it, so
              // the first thing you see is always a plausible pairing. Only
              // until you have set the hair yourself — after that it is yours.
              if (key === 'skin' && !hairChosen) look.hair = item.hair;
              if (key === 'hair') hairChosen = true;
              repaintChoosers();
              paintPreview();
            },
          },
          face,
        ),
      );
    });

    /** Redraw every option in this row against the look as it now stands. */
    function repaint() {
      for (const { face, value } of canvases) {
        paintSurveyor(face, { ...look, [key]: value }, crop);
      }
      for (const b of row.children) {
        const on = Number(b.dataset.index) === look[key];
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-checked', String(on));
      }
    }

    return { row, repaint };
  }

  let hairChosen = false;
  const skinChooser = chooser('swatch-skin', SKIN_TONES, 'skin', HEAD);
  const hairChooser = chooser('swatch-hair', HAIR_TONES, 'hair', HEAD);
  const hatChooser = chooser('swatch-hat', HAT_STYLES, 'hat', HEAD);

  /**
   * The body choice, as two faces.
   *
   * It used to be the words "Homem" and "Mulher" on a pair of buttons, next to
   * three rows of colour squares — a form, in a panel whose whole job is to
   * show you somebody. The difference between the two is a silhouette, so it is
   * the one choice here that genuinely has to be looked at rather than read,
   * and the labels survive as the accessible name.
   */
  const bodyChooser = (() => {
    const row = el('div.swatch-row.body-choice', { role: 'radiogroup', 'aria-label': t('intro.bodyTitle') });
    const canvases = [];

    for (const id of ['m', 'f']) {
      const face = el('canvas.swatch-face', { width: BUST.w * MINI, height: BUST.h * MINI, 'aria-hidden': 'true' });
      canvases.push({ face, value: id });
      row.append(
        el(
          `button.swatch.swatch-body${id === look.body ? '.is-active' : ''}`,
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(id === look.body),
            'aria-label': t(`look.body.${id}`),
            title: t(`look.body.${id}`),
            dataset: { body: id },
            onclick: () => {
              look.body = id;
              // The name pool is gendered, so an untouched generated name
              // follows the body. One the player typed is never overwritten.
              if (!nameEdited) setName(rollName(id));
              repaintChoosers();
              paintPreview();
            },
          },
          face,
        ),
      );
    }

    function repaint() {
      for (const { face, value } of canvases) paintSurveyor(face, { ...look, body: value }, BUST);
      for (const b of row.children) {
        const on = b.dataset.body === look.body;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-checked', String(on));
      }
    }

    return { row, repaint };
  })();

  const choosers = [bodyChooser, skinChooser, hairChooser, hatChooser];

  /**
   * Repaint every row, not just the one that was clicked.
   *
   * A skin tone changes what the hair rides on and a hat changes what shades
   * the face, so a row left alone would be advertising a surveyor the player
   * can no longer become. It also replaces the old hand-written highlight sync,
   * which existed only because choosing a skin tone moves the hair selection.
   */
  function repaintChoosers() {
    for (const c of choosers) c.repaint();
  }

  const characterSection = el(
    'section.intro-section.intro-character',
    {},
    el('h3', { 'data-i18n': 'intro.characterTitle' }),
    el(
      'div.char-panel',
      {},
      preview,
      el(
        'div.char-options',
        {},
        el(
          'div.name-row',
          {},
          nameInput,
          el('button.btn.btn-ghost', {
            type: 'button',
            'data-i18n': 'intro.nameRoll',
            title: t('intro.nameRollHelp'),
            onclick: () => {
              setName(rollName(look.body));
              nameEdited = false;
            },
          }),
        ),
        el('label.swatch-label', { 'data-i18n': 'intro.bodyTitle' }),
        bodyChooser.row,
        el('label.swatch-label', { 'data-i18n': 'intro.skinTitle' }),
        skinChooser.row,
        el('label.swatch-label', { 'data-i18n': 'intro.hairTitle' }),
        hairChooser.row,
        el('label.swatch-label', { 'data-i18n': 'intro.hatTitle' }),
        hatChooser.row,
      ),
    ),
  );

  const seedInput = el('input.seed-input', {
    type: 'text',
    value: seed,
    spellcheck: 'false',
    'aria-label': t('intro.seedTitle'),
    oninput: (ev) => {
      seed = ev.target.value.trim() || randomSeed();
    },
  });

  const langButtons = el(
    'div.lang-switch',
    { role: 'group', 'aria-label': t('intro.languageTitle') },
    availableLanguages().map((code) =>
      el(`button.lang-btn${code === lang() ? '.is-active' : ''}`, {
        type: 'button',
        dataset: { lang: code },
        text: code.toUpperCase(),
        onclick: (ev) => {
          setLanguage(code);
          for (const b of ev.target.parentElement.children) {
            b.classList.toggle('is-active', b.dataset.lang === code);
          }
          rerender();
        },
      }),
    ),
  );

  const difficultyButtons = el(
    'div.difficulty-choice',
    { role: 'radiogroup' },
    Object.keys(DIFFICULTY).map((id) =>
      el(
        `button.diff-btn${id === difficulty ? '.is-active' : ''}`,
        {
          type: 'button',
          dataset: { diff: id },
          role: 'radio',
          'aria-checked': String(id === difficulty),
          onclick: (ev) => {
            difficulty = id;
            const group = ev.currentTarget.parentElement;
            for (const b of group.children) {
              const on = b.dataset.diff === id;
              b.classList.toggle('is-active', on);
              b.setAttribute('aria-checked', String(on));
            }
          },
        },
        el('strong', { 'data-i18n': `difficulty.${id}` }),
        el('span', { 'data-i18n': `difficulty.${id}Desc` }),
      ),
    ),
  );

  // ---- three screens, not one long scroll -----------------------------------
  //
  // A welcome to skim once, the choices that actually take thought, and the
  // control reference a player wants to glance back at — split apart so each
  // one fits a short window without a scrollbar, and the step someone is
  // stuck on is never buried under one they already finished.

  const resumeSection =
    onContinue && saved
      ? el(
          'section.intro-section.intro-resume',
          {},
          el('h3', { 'data-i18n': 'intro.resumeTitle' }),
          el('p', { text: t('intro.resumeSummary', { done: saved.done, money: num(saved.money, 0) }) }),
          el('p.hint', { 'data-i18n': 'intro.resumeWarning' }),
        )
      : null;

  const step1 = el(
    'div.intro-step',
    {},
    // The title, properly set. The modal's own heading carries the greeting and
    // stays the accessible name of the dialog; this is the game's face, so it
    // is decorative and hidden from the reader rather than announced twice.
    el('img.intro-logo', { src: './assets/logo.svg', alt: '', 'aria-hidden': 'true' }),
    el('p.intro-tagline', { 'data-i18n': 'intro.tagline' }),
    resumeSection,
    el(
      'section.intro-section',
      {},
      el('h3', { 'data-i18n': 'intro.objectiveTitle' }),
      el('p', { 'data-i18n': 'intro.objective' }),
    ),
    el('p.disclaimer', { 'data-i18n': 'intro.disclaimer' }),
  );

  const step2 = el(
    'div.intro-step',
    {},
    characterSection,
    el(
      'div.intro-choices',
      {},
      el(
        'section.intro-section',
        {},
        el('h3', { 'data-i18n': 'intro.seedTitle' }),
        el(
          'div.seed-row',
          {},
          seedInput,
          el('button.btn.btn-ghost', {
            type: 'button',
            'data-i18n': 'intro.seedRandom',
            onclick: () => {
              seed = randomSeed();
              seedInput.value = seed;
            },
          }),
        ),
        el('p.hint', { 'data-i18n': 'intro.seedHelp' }),
      ),
    ),
    el('section.intro-section', {}, el('h3', { 'data-i18n': 'intro.difficultyTitle' }), difficultyButtons),
  );

  const step3 = el(
    'div.intro-step',
    {},
    el(
      'section.intro-section',
      {},
      el('h3', { 'data-i18n': 'intro.controlsTitle' }),
      el(
        'dl.controls',
        {},
        CONTROLS().flatMap(([k, d]) => [el('dt', { 'data-i18n': k }), el('dd', { 'data-i18n': d })]),
      ),
    ),
  );

  // Fixed content, reused across steps — moving a node to a new parent keeps
  // its state (a canvas' painted pixels, an input's value), so nothing here
  // gets rebuilt or repainted just because the player stepped away and back.
  const steps = [step1, step2, step3];
  let currentStep = 1;

  const dialog = modals.open({
    titleKey: 'intro.title',
    body: el('div.intro-wizard'),
    dismissible: false,
    wide: true,
    actions: [],
  });

  // Top-left of the title bar, not buried in step 2 — a player who can't
  // read the language it opened in needs to find this before anything else,
  // and the header sits outside what `setBody` swaps, so it stays put across
  // every step without being rebuilt.
  const modalHead = dialog.node.querySelector('.modal-head');
  if (modalHead) {
    modalHead.classList.add('modal-head-lang');
    modalHead.insertBefore(langButtons, modalHead.firstChild);
  }

  function stepIndicator() {
    return el(
      'div.intro-steps',
      {},
      steps.map((_, i) => el(`span.intro-step-dot${i + 1 === currentStep ? '.is-active' : ''}`, { 'aria-hidden': 'true' })),
      el('span.intro-step-label', { text: t('intro.step', { n: currentStep, total: steps.length }) }),
    );
  }

  function navRow() {
    const isLast = currentStep === steps.length;
    const back = el('button.btn.btn-ghost', {
      type: 'button',
      'data-i18n': 'intro.back',
      disabled: currentStep === 1,
      onclick: () => {
        currentStep = Math.max(1, currentStep - 1);
        renderStep();
      },
    });

    const forward = [];
    if (!isLast) {
      forward.push(
        el('button.btn.btn-primary', {
          type: 'button',
          'data-i18n': 'intro.next',
          onclick: () => {
            currentStep = Math.min(steps.length, currentStep + 1);
            renderStep();
          },
        }),
      );
    } else {
      if (onContinue) {
        forward.push(
          el('button.btn.btn-primary', {
            type: 'button',
            'data-i18n': 'intro.resume',
            onclick: () => {
              dialog.close();
              onContinue();
            },
          }),
        );
      }
      forward.push(
        el(`button.btn${onContinue ? '' : '.btn-primary'}`, {
          type: 'button',
          'data-i18n': onContinue ? 'intro.startNew' : 'intro.start',
          onclick: () => {
            dialog.close();
            // A name left blank falls back to a generated one rather than
            // shipping an unsigned memorial descritivo.
            onStart({ seed, difficulty, name: name.trim() || rollName(look.body), look: { ...look } });
          },
        }),
      );
    }

    return el('div.intro-nav', {}, back, el('div.intro-nav-forward', {}, forward));
  }

  function renderStep() {
    const wrap = el('div.intro-wizard', {}, stepIndicator(), steps[currentStep - 1], navRow());
    // `data-i18n` nodes only pick up their text when `applyI18n` sees them —
    // and steps 2 and 3 sit unattached between renders, so translating the
    // dialog as a whole (as `rerender` used to) missed them entirely. Doing
    // it here, on the tree about to be shown, is what actually reaches them.
    applyI18n(wrap);
    dialog.setBody(wrap);
    // Land back at the top of the step, not wherever the previous one was
    // scrolled to — and `preventScroll` on the focus below matters for the
    // same reason: focusing a button at the bottom of a tall step would
    // otherwise auto-scroll straight back past everything above it.
    const bodyNode = dialog.node.querySelector('.modal-body');
    if (bodyNode) bodyNode.scrollTop = 0;
    // Send focus to the step's forward action, so Enter does the obvious
    // thing on every step the way it did with the old single footer button.
    wrap.querySelector('.intro-nav .btn-primary')?.focus({ preventScroll: true });
  }

  function rerender() {
    const title = dialog.node.querySelector('.modal-title');
    if (title) title.textContent = t('intro.title');
    renderStep();
  }

  rerender();
  repaintChoosers();
  paintPreview();
  return dialog;
}
