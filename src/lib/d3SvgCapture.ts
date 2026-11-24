export interface CapturedD3Chart {
  title: string;
  subtitle?: string;
  dataUrl: string;
  widthPx: number;
  heightPx: number;
}

const PRINT_CSS_VARS: Record<string, string> = {
  '--text': '#071d41',
  '--muted': '#3d4f6b',
  '--subtle': '#5c6e8a',
  '--line': '#d6e0ec',
  '--line-strong': '#b6c6dc',
  '--panel': '#ffffff',
  '--panel-soft': '#f7f9fc',
  '--panel-raised': '#edf2f8',
  '--accent': '#1351b4',
  '--accent-hover': '#0c326f',
  '--accent-soft': 'rgba(19, 81, 180, 0.12)',
  '--good': '#168821',
  '--warning': '#b45309',
  '--bad': '#c92a2a',
  '--gov-navy': '#071d41',
  '--gov-yellow': '#ffcd07',
  '--gov-green': '#168821',
};

function resolveCssVariables(raw: string): string {
  if (!raw || !raw.includes('var(')) return raw;
  return raw.replace(/var\(\s*(--[a-zA-Z0-9-]+)(?:\s*,\s*([^)]+))?\s*\)/g, (_, name, fallback) => {
    return PRINT_CSS_VARS[name] || (fallback ? fallback.trim() : '#071d41');
  });
}

function normalizeSvgForPdfPrint(svg: SVGSVGElement, width: number, height: number): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const pad = 12;
  const existingVb = svg.getAttribute('viewBox');
  let totalW = Math.max(120, Math.round(width) + pad * 2);
  let totalH = Math.max(80, Math.round(height) + pad * 2);
  let viewBoxStr = `${-pad} ${-pad} ${totalW} ${totalH}`;

  if (existingVb) {
    const parts = existingVb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n)) && parts[2] > 0 && parts[3] > 0) {
      totalW = Math.max(120, Math.round(parts[2]) + pad * 2);
      totalH = Math.max(80, Math.round(parts[3]) + pad * 2);
      viewBoxStr = `${parts[0] - pad} ${parts[1] - pad} ${totalW} ${totalH}`;
    }
  }

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', String(totalW));
  clone.setAttribute('height', String(totalH));
  clone.setAttribute('viewBox', viewBoxStr);
  clone.setAttribute('color', '#071d41');
  clone.setAttribute(
    'style',
    "font-family: system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: #071d41; background: #ffffff;",
  );

  // Embed inline print CSS so Tailwind utility classes on SVG <text> remain sharp in standalone SVG blobs
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = `
    text { font-family: system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; }
    .font-semibold { font-weight: 600; }
    .font-bold { font-weight: 700; }
    .font-extrabold { font-weight: 800; }
    .font-mono-num { font-variant-numeric: tabular-nums; }
  `;
  clone.insertBefore(styleEl, clone.firstChild);

  // Strip interactive hover overlays if any
  clone.querySelectorAll('rect[fill="transparent"]').forEach((el) => el.remove());

  const attrNames = ['fill', 'stroke', 'color', 'stop-color', 'style'];
  const allNodes = [clone, ...Array.from(clone.querySelectorAll('*'))];
  for (const node of allNodes) {
    for (const attr of attrNames) {
      const val = node.getAttribute(attr);
      if (!val) continue;
      let nextVal = val.includes('var(') ? resolveCssVariables(val) : val;
      if (nextVal.includes('currentColor')) {
        nextVal = nextVal.replace(/currentColor/g, '#071d41');
      }
      if (nextVal !== val) {
        node.setAttribute(attr, nextVal);
      }
    }
    if (node.tagName.toLowerCase() === 'text') {
      const existingStyle = node.getAttribute('style') || '';
      if (!existingStyle.includes('font-family')) {
        node.setAttribute(
          'style',
          `${existingStyle}${existingStyle ? '; ' : ''}font-family: system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;`,
        );
      }
    }
  }

  return clone;
}

async function svgElementToPngDataUrl(
  svg: SVGSVGElement,
  width: number,
  height: number,
  scale = 2.5,
): Promise<{ dataUrl: string; widthPx: number; heightPx: number }> {
  const normalized = normalizeSvgForPdfPrint(svg, width, height);
  const outW = Number(normalized.getAttribute('width')) || Math.round(width) + 24;
  const outH = Number(normalized.getAttribute('height')) || Math.round(height) + 24;

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(normalized);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const blobUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Falha ao rasterizar gráfico D3.'));
      image.src = blobUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(outW * scale);
    canvas.height = Math.round(outH * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Contexto gráfico 2D indisponível para exportação.');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, outW, outH);

    return {
      dataUrl: canvas.toDataURL('image/png'),
      widthPx: outW,
      heightPx: outH,
    };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export async function captureD3ChartsFromContainer(
  rootEl: HTMLElement | null,
): Promise<CapturedD3Chart[]> {
  if (!rootEl) return [];

  const cards = Array.from(rootEl.querySelectorAll<HTMLElement>('[data-d3-chart-card]'));
  const captured: CapturedD3Chart[] = [];

  for (const card of cards) {
    const svgs = Array.from(card.querySelectorAll('svg'));
    let targetSvg: SVGSVGElement | null = null;
    let targetRect: DOMRect | null = null;

    for (const candidate of svgs) {
      const rect = candidate.getBoundingClientRect();
      if (rect.width >= 160 && rect.height >= 70) {
        targetSvg = candidate;
        targetRect = rect;
        break;
      }
    }

    if (!targetSvg || !targetRect) continue;

    const title =
      card.getAttribute('data-d3-chart-title') ||
      card.querySelector('h3')?.textContent?.trim() ||
      'Painel Analítico D3';
    const subtitle =
      card.getAttribute('data-d3-chart-subtitle') ||
      card.querySelector('p')?.textContent?.trim() ||
      undefined;

    try {
      const { dataUrl, widthPx, heightPx } = await svgElementToPngDataUrl(
        targetSvg,
        targetRect.width,
        targetRect.height,
      );
      captured.push({
        title,
        subtitle,
        dataUrl,
        widthPx,
        heightPx,
      });
    } catch {
      // Skip any chart that could not be serialized without aborting the PDF report
    }
  }

  return captured;
}
