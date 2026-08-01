import { useMemo, useState } from 'react';
import { Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ComposedChart, ReferenceLine, CartesianGrid } from 'recharts';
import { buildInvestmentValueHistory, type InvestmentSeriesPoint } from './investmentAnalysis';
import { formatMoney } from './money';
import type { Investment, InvestmentValueUpdate } from '../types/contracts';
import { EmptyState } from '../components/EmptyState';

interface InvestmentHistoryChartProps {
  updates: InvestmentValueUpdate[];
  investments: Investment[];
}

/** Paleta categórica dedicada a gráfico (`--chart-1`..`--chart-5`, `themes.css`) — validada com
 * `dataviz`'s `validate_palette.js` (todos os checks passam no tema claro) e já theme-aware
 * (troca sozinha no escuro via CSS var), diferente de um hex fixo. Usada só como fallback: um
 * investimento com `color` própria (escolhida na criação) sempre usa a dela. */
const CHART_FALLBACK_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

function colorFor(investment: Investment, index: number): string {
  return investment.color ?? CHART_FALLBACK_COLORS[index % CHART_FALLBACK_COLORS.length];
}

function formatAxisDate(dateKey: string) {
  const [, m, d] = dateKey.split('-');
  return `${d}/${m}`;
}

function formatPct(v: number) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function CustomTooltip({
  active, payload, label, investments, colorById
}: {
  active?: boolean;
  payload?: Array<{ value: number | null; dataKey: string; payload: InvestmentSeriesPoint }>;
  label?: string;
  investments: Investment[];
  colorById: Map<string, string>;
}) {
  if (!active || !payload || !label || payload.length === 0) return null;
  const [, y, m, d] = label.split('-');
  const point = payload[0].payload;
  const nameById = new Map(investments.map((inv) => [inv.id, inv.name]));

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
      borderRadius: 8, padding: '0.6rem 0.85rem', fontSize: '0.82rem',
      boxShadow: 'var(--shadow-sm)'
    }}>
      <p style={{ margin: '0 0 0.3rem', fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        {d}/{m}/{y}
      </p>
      {payload.filter((entry) => entry.value !== null && entry.value !== undefined).map((entry) => {
        const detail = point.perInvestment[entry.dataKey];
        return (
          <p key={entry.dataKey} style={{ margin: '3px 0', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            {/* Chave de linha (traço curto), não uma caixa — a legenda já é a marca cheia. */}
            <span style={{ width: 12, height: 2, borderRadius: 1, background: colorById.get(entry.dataKey), display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              {nameById.get(entry.dataKey) ?? entry.dataKey}
            </span>
            <strong style={{ marginLeft: 'auto', fontFamily: "'DM Sans', system-ui, sans-serif", color: (entry.value ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatPct(entry.value ?? 0)}
            </strong>
            {detail && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                ({formatMoney(detail.balanceCents)})
              </span>
            )}
          </p>
        );
      })}
    </div>
  );
}

/** Marca só a PONTA de cada linha (último ponto real, não todo dia) — reforça de relance qual
 * cor é qual investimento sem poluir a linha com um ponto em cada degrau. Tipagem do Recharts
 * pra `dot` como função é notoriamente inconsistente entre versões — `any` aqui é pragmático,
 * não descuido: só lemos `cx`/`cy`/`index`/`value`, que a lib sempre passa nesse callback. */
function makeEndDot(color: string, lastIndex: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function EndDot(props: any) {
    if (props.index !== lastIndex || props.value === null || props.value === undefined) return <g />;
    return (
      <circle
        cx={props.cx} cy={props.cy} r={4}
        fill={color} stroke="var(--bg-surface)" strokeWidth={2}
      />
    );
  };
}

export function InvestmentHistoryChart({ updates, investments }: InvestmentHistoryChartProps) {
  const points: InvestmentSeriesPoint[] = useMemo(() => buildInvestmentValueHistory(updates), [updates]);
  // Recharts precisa de um `dataKey` string por `<Line>` — uma função por linha parece prático,
  // mas todas têm o MESMO texto-fonte (só a variável capturada `inv` muda, invisível pra
  // `.toString()`), e o Recharts deriva uma chave interna a partir disso: as 3 linhas colidiam
  // na mesma chave, disparando "two children with the same key" (achado ao vivo, 01/08/2026).
  // Achatar o % de cada investimento pra uma propriedade própria no ponto evita o problema —
  // `perInvestment` continua junto pro tooltip (detalhe em R$).
  const chartData = useMemo(
    () => points.map((point) => ({
      ...point,
      ...Object.fromEntries(investments.map((inv) => [inv.id, point.perInvestment[inv.id]?.returnPct ?? null]))
    })),
    [points, investments]
  );
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const colorById = useMemo(() => new Map(investments.map((inv, i) => [inv.id, colorFor(inv, i)])), [investments]);

  // Índice do último ponto com dado real por investimento, e o rendimento nesse ponto — pro
  // dot de ponta e pra legenda mostrar o % atual (não só servir de toggle).
  const lastPointByInvestment = useMemo(() => {
    const result = new Map<string, { index: number; returnPct: number }>();
    points.forEach((point, index) => {
      for (const [investmentId, value] of Object.entries(point.perInvestment)) {
        if (value) result.set(investmentId, { index, returnPct: value.returnPct });
      }
    });
    return result;
  }, [points]);

  function toggle(investmentId: string) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(investmentId)) next.delete(investmentId); else next.add(investmentId);
      return next;
    });
  }

  if (points.length < 2) {
    return (
      <EmptyState
        illustration="transactions"
        title="Sem dados suficientes"
        description="O gráfico mostra a evolução ao longo de vários dias. Volte aqui em dias diferentes conforme for atualizando o valor pra ver a linha se formando."
      />
    );
  }

  return (
    <div className="form-stack" style={{ gap: '0.6rem' }}>
      {/* Legenda com toggle — clicar esconde/mostra a linha daquele investimento sem afetar os
          números do dashboard (que sempre somam todos, escondidos ou não). Mostra o % atual de
          cada um, não só o nome — a legenda vira um resumo, não só uma chave. */}
      {investments.length > 1 && (
        <div className="chip-row" role="group" aria-label="Investimentos no gráfico">
          {investments.map((inv, i) => {
            const hidden = hiddenIds.has(inv.id);
            const current = lastPointByInvestment.get(inv.id);
            return (
              <button
                key={inv.id}
                type="button"
                className={`chip${hidden ? '' : ' chip--active'}`}
                style={{ opacity: hidden ? 0.55 : 1 }}
                onClick={() => toggle(inv.id)}
                aria-pressed={!hidden}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                  marginRight: '0.35rem', background: colorFor(inv, i)
                }} />
                {inv.name}
                {current && (
                  <span style={{
                    marginLeft: '0.35rem', fontSize: '0.72rem', fontWeight: 700,
                    color: current.returnPct >= 0 ? 'var(--success)' : 'var(--danger)'
                  }}>
                    {formatPct(current.returnPct)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
            <CartesianGrid horizontal vertical={false} stroke="var(--border-subtle)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatAxisDate}
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              axisLine={{ stroke: 'var(--border-subtle)' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            {/* Eixo em %, não em R$ — auto-ajustado ao intervalo real dos dados (com folga), não
                travado em 0-100%. Um CDB que rendeu 2% e uma ação que oscilou 8% ficam os dois
                visíveis no mesmo gráfico, não importa o tamanho em R$ de cada um. */}
            <YAxis
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
              width={38}
              domain={([dataMin, dataMax]) => {
                const span = Math.max(dataMax - dataMin, 1);
                const padding = span * 0.2;
                return [Math.min(dataMin - padding, -0.5), Math.max(dataMax + padding, 0.5)];
              }}
            />
            <Tooltip
              content={<CustomTooltip investments={investments} colorById={colorById} />}
              cursor={{ stroke: 'var(--border-default)', strokeWidth: 1 }}
            />
            {/* Linha de base em 0% — acima é ganho, abaixo é perda. Sólida (não tracejada): uma
                referência não é uma projeção. Substitui a antiga linha de "total aportado" em
                R$ — em %, aportado é sempre a própria base 0, então isto já carrega a mesma
                informação sem precisar de uma segunda linha. */}
            <ReferenceLine y={0} stroke="var(--text-muted)" strokeWidth={1} />
            {investments.map((inv, i) => {
              const lastPoint = lastPointByInvestment.get(inv.id);
              const color = colorFor(inv, i);
              return (
                <Line
                  key={inv.id}
                  type="stepAfter"
                  dataKey={inv.id}
                  stroke={color}
                  strokeWidth={2}
                  dot={lastPoint ? makeEndDot(color, lastPoint.index) : false}
                  connectNulls={false}
                  hide={hiddenIds.has(inv.id)}
                  name={inv.id}
                  activeDot={{ r: 4, fill: color, stroke: 'var(--bg-surface)', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
