/**
 * story-scene — 故事媒介阶梯 Widget
 * L0 文字 → L1 图像 → L2 视频 → L3 软件级交互
 */
const MEDIUMS = [
  { level: 0, label: 'L0 文字', desc: '靠想象补全画面' },
  { level: 1, label: 'L1 图像', desc: '看见你看见的' },
  { level: 2, label: 'L2 视频', desc: '连续时空中的在场' },
  { level: 3, label: 'L3 交互', desc: '参与并塑造故事' },
];

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function beatFromTime(time, beatCount) {
  const t = clamp(time, 0, 100) / 100;
  const idx = clamp(Math.floor(t * beatCount), 0, beatCount - 1);
  return idx;
}

function rainEffects(rain) {
  const r = rain / 100;
  return {
    blur: r * 3,
    brightness: 1 - r * 0.35,
    saturate: 1 - r * 0.4,
    overlay: r * 0.55,
  };
}

function storyScene(container, config = {}) {
  const story = config.story || {};
  const beats = story.beats || [];
  const images = story.images || {};
  const video = story.video || {};
  const interactive = story.interactive || {};

  if (!beats.length) {
    container.textContent = '故事数据为空';
    return;
  }

  let mediumLevel = 0;
  let rain = interactive.rain?.default ?? 0;
  let time = interactive.time?.default ?? 0;
  let beatIdx = 0;

  container.innerHTML = '';
  container.className = 'ethan-widget ethan-story-scene my-10';

  const root = document.createElement('div');
  root.className = 'ethan-story-scene__root';

  const header = document.createElement('div');
  header.className = 'ethan-story-scene__header';
  header.innerHTML = `
    <div>
      <h3 class="ethan-story-scene__title">${story.title || '故事'}</h3>
      ${story.tagline ? `<p class="ethan-story-scene__tagline">${story.tagline}</p>` : ''}
    </div>
  `;

  const tabs = document.createElement('div');
  tabs.className = 'ethan-story-scene__tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '媒介阶梯');

  const body = document.createElement('div');
  body.className = 'ethan-story-scene__body';

  const viewport = document.createElement('div');
  viewport.className = 'ethan-story-scene__viewport';
  viewport.setAttribute('aria-live', 'polite');

  const narrative = document.createElement('div');
  narrative.className = 'ethan-story-scene__narrative';

  const controls = document.createElement('div');
  controls.className = 'ethan-story-scene__controls';
  controls.hidden = true;

  body.appendChild(viewport);
  body.appendChild(narrative);
  root.appendChild(header);
  root.appendChild(tabs);
  root.appendChild(body);
  root.appendChild(controls);
  container.appendChild(root);

  function renderTabs() {
    tabs.innerHTML = '';
    MEDIUMS.forEach(m => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ethan-story-scene__tab' + (mediumLevel === m.level ? ' is-active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', mediumLevel === m.level ? 'true' : 'false');
      btn.innerHTML = `<span class="ethan-story-scene__tab-label">${m.label}</span><span class="ethan-story-scene__tab-desc">${m.desc}</span>`;
      btn.addEventListener('click', () => {
        mediumLevel = m.level;
        render();
      });
      tabs.appendChild(btn);
    });
  }

  function renderViewport() {
    const beat = beats[beatIdx];
    const img = images[beat?.id] || {};
    const fx = rainEffects(mediumLevel === 3 ? rain : beatIdx === 2 ? 60 : beatIdx === 1 ? 20 : 0);

    viewport.style.filter = mediumLevel >= 3
      ? `blur(${fx.blur}px) brightness(${fx.brightness}) saturate(${fx.saturate})`
      : '';

    if (mediumLevel === 0) {
      viewport.className = 'ethan-story-scene__viewport ethan-story-scene__viewport--text-only';
      viewport.innerHTML = `
        <div class="ethan-story-scene__text-stage">
          <div class="ethan-story-scene__level-badge">L0 · 纯文字</div>
          <p class="ethan-story-scene__hint">没有画面。一切靠你自己的想象。</p>
        </div>`;
      return;
    }

    const grad = img.gradient || 'from-slate-500 to-slate-700';
    const caption = img.caption || '';

    if (mediumLevel === 1) {
      viewport.className = `ethan-story-scene__viewport ethan-story-scene__viewport--image ethan-story-scene__grad-${beat?.id || 'start'}`;
      viewport.dataset.gradient = grad;
      viewport.innerHTML = `
        <div class="ethan-story-scene__level-badge">L1 · 图像</div>
        <div class="ethan-story-scene__scene" data-beat="${beat?.id}"></div>
        ${caption ? `<p class="ethan-story-scene__caption">${caption}</p>` : ''}`;
      applyGradient(viewport.querySelector('.ethan-story-scene__scene'), beat?.id);
      return;
    }

    if (mediumLevel === 2) {
      viewport.className = 'ethan-story-scene__viewport ethan-story-scene__viewport--video';
      viewport.innerHTML = `
        <div class="ethan-story-scene__level-badge">L2 · 视频</div>
        <div class="ethan-story-scene__video-stage" data-beat="${beat?.id}">
          <div class="ethan-story-scene__video-scan"></div>
          <div class="ethan-story-scene__video-grain"></div>
        </div>
        <p class="ethan-story-scene__caption">${video.caption || caption || '连续影像'}</p>`;
      applyGradient(viewport.querySelector('.ethan-story-scene__video-stage'), beat?.id);
      return;
    }

    // L3
    viewport.className = 'ethan-story-scene__viewport ethan-story-scene__viewport--interactive';
    viewport.innerHTML = `
      <div class="ethan-story-scene__level-badge">L3 · 软件交互</div>
      <div class="ethan-story-scene__scene ethan-story-scene__scene--live" data-beat="${beat?.id}"></div>
      <div class="ethan-story-scene__rain-layer" style="opacity:${fx.overlay}"></div>
      ${caption ? `<p class="ethan-story-scene__caption">${caption}</p>` : ''}
      <p class="ethan-story-scene__l3-hint">你在操控雨量与时刻——故事因你而改变。</p>`;
    applyGradient(viewport.querySelector('.ethan-story-scene__scene'), beat?.id);
  }

  function applyGradient(el, beatId) {
    if (!el) return;
    const palettes = {
      start: ['#bae6fd', '#a7f3d0', '#fef3c7'],
      cloud: ['#94a3b8', '#cbd5e1', '#e2e8f0'],
      downpour: ['#475569', '#64748b', '#94a3b8'],
    };
    const c = palettes[beatId] || palettes.start;
    el.style.background = `linear-gradient(145deg, ${c[0]}, ${c[1]}, ${c[2]})`;
  }

  function renderNarrative() {
    const beat = beats[beatIdx];
    narrative.innerHTML = `
      <p class="ethan-story-scene__beat-index">节拍 ${beatIdx + 1} / ${beats.length}</p>
      <p class="ethan-story-scene__beat-text">${beat?.text || ''}</p>`;
  }

  function renderControls() {
    const show = mediumLevel === 3;
    controls.hidden = !show;
    if (!show) {
      controls.innerHTML = '';
      return;
    }

    controls.innerHTML = '';
    const rainCfg = interactive.rain || { label: '雨量', min: 0, max: 100 };
    const timeCfg = interactive.time || { label: '时刻', min: 0, max: 100 };

    controls.appendChild(makeSlider(rainCfg.label, rainCfg.min, rainCfg.max, rain, v => {
      rain = v;
      beatIdx = beatFromTime(time, beats.length);
      renderViewport();
      renderNarrative();
    }));

    controls.appendChild(makeSlider(timeCfg.label, timeCfg.min, timeCfg.max, time, v => {
      time = v;
      beatIdx = beatFromTime(time, beats.length);
      renderViewport();
      renderNarrative();
    }));
  }

  function makeSlider(label, min, max, value, onInput) {
    const wrap = document.createElement('div');
    wrap.className = 'ethan-story-scene__control';
    const id = `ss-${label}-${Math.random().toString(36).slice(2, 7)}`;
    wrap.innerHTML = `<label for="${id}" class="ethan-story-scene__control-label">${label}</label>`;
    const input = document.createElement('input');
    input.type = 'range';
    input.id = id;
    input.min = min;
    input.max = max;
    input.value = value;
    input.className = 'ethan-story-scene__slider';
    input.addEventListener('input', () => onInput(parseFloat(input.value)));
    wrap.appendChild(input);
    return wrap;
  }

  function render() {
    if (mediumLevel < 3) {
      beatIdx = mediumLevel === 0 ? 0 : beatFromTime(33 * mediumLevel, beats.length);
    } else {
      beatIdx = beatFromTime(time, beats.length);
    }
    renderTabs();
    renderViewport();
    renderNarrative();
    renderControls();
  }

  render();
}

export default storyScene;
