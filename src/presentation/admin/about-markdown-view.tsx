/**
 * Vista React del Markdown de «Acerca de» (feature 010, T1432 TRI-01): convierte el árbol de `parseAboutMarkdown` en elementos (h1..h6, p, ul, ol, li, strong, em, a) SIN `innerHTML`.
 * Los enlaces llevan `rel="noopener noreferrer"` y solo un `href` ya validado por la lista cerrada de destinos.
 *
 * @implements REQ-ACE10-001, EDGE-010-007, D10-07
 */
import { Fragment } from 'react';
import { parseAboutMarkdown, type AboutInline } from './about-markdown.ts';

function Inline({ nodes }: { readonly nodes: readonly AboutInline[] }): JSX.Element {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.t === 'text') return <Fragment key={index}>{node.v}</Fragment>;
        if (node.t === 'strong') return <strong key={index}><Inline nodes={node.c} /></strong>;
        if (node.t === 'em') return <em key={index}><Inline nodes={node.c} /></em>;
        return (
          <a key={index} href={node.href} rel="noopener noreferrer">
            <Inline nodes={node.c} />
          </a>
        );
      })}
    </>
  );
}

const HEADINGS = ['h1', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

export function AboutMarkdownView({ source, headingOffset = 0 }: { readonly source: string; readonly headingOffset?: number }): JSX.Element {
  return (
    <>
      {parseAboutMarkdown(source, headingOffset).map((block, index) => {
        if (block.t === 'h') {
          const Tag = HEADINGS[block.level]!;
          return (
            <Tag key={index}>
              <Inline nodes={block.c} />
            </Tag>
          );
        }
        if (block.t === 'p') {
          return (
            <p key={index}>
              <Inline nodes={block.c} />
            </p>
          );
        }
        const List = block.ordered ? 'ol' : 'ul';
        return (
          <List key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Inline nodes={item} />
              </li>
            ))}
          </List>
        );
      })}
    </>
  );
}
