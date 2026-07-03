/**
 * media-slider — 滑块控制预览区域 CSS 滤镜
 * 演示「超媒体」交互：读者通过滑块改变媒介呈现
 */
const DEFAULT_CONTROLS = [
  { id: 'blur', label: '模糊', prop: 'blur', min: 0, max: 10, step: 0.5, unit: 'px', default: 0 },
  { id: 'brightness', label: '亮度', prop: 'brightness', min: 0.5, max: 1.5, step: 0.05, unit: '', default: 1, format: v => v },
  { id: 'saturate', label: '饱和度', prop: 'saturate', min: 0, max: 2, step: 0.1, unit: '', default: 1, format: v => v },
];

function mediaSlider(container, config = {}) {
  const controlIds = (config.controls || 'blur,brightness,saturate').split(',').map(s => s.trim());
  const controls = DEFAULT_CONTROLS.filter(c => controlIds.includes(c.id));

  const state = Object.fromEntries(controls.map(c => [c.id, c.default]));

  container.innerHTML = '';
  container.className = 'ethan-widget ethan-media-slider my-8 rounded-xl border border-neutral-200 p-6 dark:border-neutral-700';

  const preview = document.createElement('div');
  preview.className = 'ethan-media-slider__preview mb-6 flex h-48 items-center justify-center rounded-lg bg-gradient-to-br from-primary-400/30 via-primary-600/20 to-neutral-800/40 text-neutral-600 dark:text-neutral-300';
  preview.setAttribute('aria-live', 'polite');
  preview.innerHTML = '<span class="text-lg font-medium">拖动滑块，改变这里的样式</span>';

  const panel = document.createElement('div');
  panel.className = 'ethan-media-slider__controls space-y-4';
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', '媒体样式控制');

  function applyFilters() {
    const parts = [];
    if (state.blur !== undefined) parts.push(`blur(${state.blur}px)`);
    if (state.brightness !== undefined) parts.push(`brightness(${state.brightness})`);
    if (state.saturate !== undefined) parts.push(`saturate(${state.saturate})`);
    preview.style.filter = parts.join(' ');
  }

  controls.forEach(ctrl => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-4';

    const label = document.createElement('label');
    label.className = 'w-16 shrink-0 text-sm font-medium text-neutral-700 dark:text-neutral-300';
    label.textContent = ctrl.label;
    label.setAttribute('for', `slider-${ctrl.id}-${Math.random().toString(36).slice(2)}`);

    const input = document.createElement('input');
    input.type = 'range';
    input.id = label.htmlFor;
    input.min = ctrl.min;
    input.max = ctrl.max;
    input.step = ctrl.step;
    input.value = ctrl.default;
    input.className = 'h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-neutral-200 dark:bg-neutral-700';

    input.addEventListener('input', () => {
      state[ctrl.id] = parseFloat(input.value);
      applyFilters();
    });

    row.appendChild(label);
    row.appendChild(input);
    panel.appendChild(row);
  });

  container.appendChild(preview);
  container.appendChild(panel);
  applyFilters();
}

export default mediaSlider;
