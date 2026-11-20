const assetBase = new URL('./', import.meta.url);

function loadScript(path) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL(path, assetBase);
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Unable to load ${path}`));
    document.head.append(script);
  });
}

async function loadViewer(container) {
  const placeholder = container.firstElementChild;
  const status = container.querySelector('[data-glitch-viewer-status]');
  status.hidden = false;
  status.textContent = 'Loading the board and component catalog…';

  try {
    const [board, { mountViewer }] = await Promise.all([
      fetch(new URL('board.json', assetBase)).then(response => {
        if (!response.ok) throw new Error(`Board data returned HTTP ${response.status}`);
        return response.json();
      }),
      (async () => {
        const threeReady = window.THREE ? Promise.resolve() : loadScript('../vendor/three.min.js');
        await Promise.all([
          threeReady.then(() => {
            if (!window.THREE.GLTFLoader) return loadScript('../vendor/GLTFLoader.js');
          }),
          window.V2CadGeometry || loadScript('../v2-assembly-models.js?v=mechanics-20261003'),
          window.V2CadStudio || loadScript('../v2-cad-studio.js'),
        ]);
        return import('./viewer.js?v=20261120-studio');
      })(),
    ]);
    await mountViewer(container, board, {
      assetBase: assetBase.href,
      artwork: board.artwork,
      poster: new URL('assembly.webp?v=20261120-studio', assetBase).href,
    });
  } catch (error) {
    console.error('Isolated Glitch Tester viewer could not load', error);
    container.replaceChildren(placeholder);
    status.textContent = 'The interactive viewer is unavailable. The assembly render is shown above.';
  }
}

async function loadDemo(container) {
  const status = container.querySelector('[data-glitch-demo-status]');
  try {
    const { mountDemo } = await import('./demo.js');
    mountDemo(container);
  } catch (error) {
    console.error('Isolated Glitch Tester demo could not load', error);
    container.replaceChildren(status);
    status.hidden = false;
    status.textContent = 'The signal demo is unavailable.';
  }
}

const sections = new Map([
  [document.querySelector('[data-glitch-viewer]'), loadViewer],
  [document.querySelector('[data-glitch-demo]'), loadDemo],
]);

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      observer.unobserve(target);
      sections.get(target)(target);
    }
  }, { rootMargin: '320px 0px' });
  for (const section of sections.keys()) observer.observe(section);
} else {
  for (const [section, load] of sections) load(section);
}
