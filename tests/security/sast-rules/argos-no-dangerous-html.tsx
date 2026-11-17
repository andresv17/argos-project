/** Casos de prueba de `semgrep --test` para argos-no-dangerous-html.yml (no es código de la aplicación). */
export function Unsafe({ html }: { readonly html: string }): JSX.Element {
  // ruleid: argos-no-dangerously-set-inner-html
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Safe({ text }: { readonly text: string }): JSX.Element {
  // ok: argos-no-dangerously-set-inner-html
  return <div>{text}</div>;
}

export function sinks(node: HTMLElement, html: string): void {
  // ruleid: argos-no-raw-html-sink
  node.innerHTML = html;
  // ruleid: argos-no-raw-html-sink
  node.insertAdjacentHTML('beforeend', html);
  // ruleid: argos-no-raw-html-sink
  document.write(html);
  // ok: argos-no-raw-html-sink
  node.textContent = html;
}
