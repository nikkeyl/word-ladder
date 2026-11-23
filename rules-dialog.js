'use strict';

const bindRulesDialog = (dialog, trigger) => {
  const CLOSED_STYLE = { opacity: 0, transform: 'translateY(.375rem)' };
  const rulesMotionOptions = () => {
    const style = getComputedStyle(dialog);
    const duration = style.getPropertyValue('--motion-duration').trim();

    return {
      duration: parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000),
      easing: style.getPropertyValue('--motion-easing').trim(),
    };
  };

  let rulesOpening;

  trigger.addEventListener('click', () => {
    dialog.showModal();
    // Resolve the backdrop style while it is still transparent.
    void getComputedStyle(dialog, '::backdrop').opacity;
    dialog.dataset.visible = '';
    const options = rulesMotionOptions();
    rulesOpening = options.duration
      ? dialog.animate([CLOSED_STYLE, { opacity: 1, transform: 'none' }], options)
      : null;
  });

  const closeRules = async () => {
    if (!Object.hasOwn(dialog.dataset, 'visible')) return;

    const style = getComputedStyle(dialog);
    const current = { opacity: Number(style.opacity), transform: style.transform };
    const options = rulesMotionOptions();
    rulesOpening?.cancel();
    delete dialog.dataset.visible;

    if (options.duration) {
      const closing = dialog.animate([current, CLOSED_STYLE], options);
      await closing.finished.catch(() => {});
    }

    dialog.close();
  };

  for (const eventName of ['submit', 'cancel']) {
    dialog.addEventListener(eventName, (event) => {
      event.preventDefault();
      closeRules();
    });
  }

  const isBackdrop = (event) => {
    if (event.target !== dialog) return false;

    const { left, top, right, bottom } = dialog.getBoundingClientRect();
    return event.clientX < left || event.clientX > right
      || event.clientY < top || event.clientY > bottom;
  };

  let pressedBackdrop = false;
  dialog.addEventListener('pointerdown', (event) => {
    pressedBackdrop = isBackdrop(event);
  });
  dialog.addEventListener('click', (event) => {
    if (pressedBackdrop && isBackdrop(event)) closeRules();
    pressedBackdrop = false;
  });
};
