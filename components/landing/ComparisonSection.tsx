import type { KefyCopy } from '@/lib/content';

interface Props {
  copy: KefyCopy['cmp'];
}

function CellValue({ val, partial }: { val: string; partial: string }) {
  if (val === 'yes') return <span className="yes">✓</span>;
  if (val === 'no') return <span className="no">✕</span>;
  if (val === 'partial') return <span className="partial">{partial}</span>;
  return <>{val}</>;
}

export default function ComparisonSection({ copy }: Props) {
  return (
    <section className="section" id="compare">
      <div className="container">
        <div className="section-head reveal">
          <span className="label">{copy.tag}</span>
          <h2 className="h2">{copy.h2}</h2>
        </div>

        <div className="cmp-wrap reveal" style={{ animationDelay: '0.12s' }}>
          <table className="cmp">
            <thead>
              <tr>
                <th style={{ width: '280px' }} />
                {copy.cols.map((col, i) => (
                  <th key={i} className={i === 0 ? 'kefy' : ''}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {copy.rows.map((row, ri) => {
                const cells = row as string[];
                const isPrice = cells[cells.length - 1] === 'price';
                const dataRow = isPrice ? cells.slice(0, -1) : cells;
                return (
                  <tr key={ri} className={isPrice ? 'cmp-price-row' : ''}>
                    <td className="first">{dataRow[0]}</td>
                    {dataRow.slice(1).map((cell, ci) => (
                      <td key={ci} className={ci === 0 ? 'kefy' : ''}>
                        {isPrice ? (
                          cell
                        ) : (
                          <CellValue val={cell} partial={copy.partial} />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
