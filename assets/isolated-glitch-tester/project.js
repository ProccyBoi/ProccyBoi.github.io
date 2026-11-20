const assetBase = new URL('./', import.meta.url);
const poster = new URL('assembly.webp?v=20261120-studio', assetBase).href;
let boardScene;

function loadScript(path) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL(path, assetBase);
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Unable to load ${path}`));
    document.head.append(script);
  });
}

function loadBoardScene() {
  boardScene ??= Promise.all([
    fetch(new URL('board.json', assetBase)).then(response => {
      if (!response.ok) throw new Error(`Board data returned HTTP ${response.status}`);
      return response.json();
    }),
    (async () => {
      if (!window.THREE) await loadScript('../vendor/three.min.js');
      await Promise.all([
        window.THREE.GLTFLoader || loadScript('../vendor/GLTFLoader.js'),
        window.V2CadGeometry || loadScript('../v2-assembly-models.js?v=mechanics-20261003'),
        window.V2CadStudio || loadScript('../v2-cad-studio.js'),
      ]);
      return import('./viewer.js?v=20261120-bench-plus');
    })(),
  ]);
  return boardScene;
}

async function loadViewer(container) {
  const placeholder = container.firstElementChild;
  const status = container.querySelector('[data-glitch-viewer-status]');
  status.hidden = false;
  status.textContent = 'Loading the board and component catalog…';

  try {
    const [board, { mountViewer }] = await loadBoardScene();
    await mountViewer(container, board, {
      assetBase: assetBase.href,
      artwork: board.artwork,
      poster,
    });
  } catch (error) {
    console.error('Isolated Glitch Tester viewer could not load', error);
    container.replaceChildren(placeholder);
    status.textContent = 'The interactive viewer is unavailable. The assembly render is shown above.';
  }
}

async function loadDemo(container) {
  const placeholder = container.firstElementChild;
  const status = container.querySelector('[data-glitch-demo-status]');
  status.hidden = false;
  status.textContent = 'Loading the board and bench controls…';

  try {
    const [{ mountDemo }, scene] = await Promise.all([
      import('./demo.js?v=20261120-bench-plus'),
      loadBoardScene().catch(error => {
        console.error('Isolated Glitch Tester bench scene could not load', error);
        return [];
      }),
    ]);
    const [board, sceneModule] = scene;
    await mountDemo(container, { board, assetBase: assetBase.href, poster, mountScene: sceneModule?.mountDemoScene });
  } catch (error) {
    console.error('Isolated Glitch Tester demo could not load', error);
    container.replaceChildren(placeholder);
    status.textContent = 'The interactive bench is unavailable. The board render is shown above.';
  }
}

const sections = new Map([
  [document.querySelector('[data-glitch-demo]'), loadDemo],
  [document.querySelector('[data-glitch-viewer]'), loadViewer],
]);
sections.delete(null);

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      observer.unobserve(target);
      sections.get(target)(target);
    }
  }, { rootMargin: '-88px 0px 160px' });
  for (const section of sections.keys()) observer.observe(section);
} else {
  for (const [section, load] of sections) load(section);
}
