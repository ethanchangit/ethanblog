/**
 * Ethan Platform — Widget 注册与初始化
 */
import mediaSlider from './widgets/media-slider.js';

const WIDGET_REGISTRY = {
  'media-slider': mediaSlider,
};

function initWidget(el) {
  const name = el.dataset.widget;
  const init = WIDGET_REGISTRY[name];
  if (!init) {
    console.warn(`[platform] Unknown widget: ${name}`);
    return;
  }
  let config = {};
  try {
    config = JSON.parse(el.dataset.config || '{}');
  } catch (_) { /* ignore */ }
  init(el, config);
}

function initAllWidgets() {
  document.querySelectorAll('[data-widget]').forEach(initWidget);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAllWidgets);
} else {
  initAllWidgets();
}
