import { useEffect, useRef } from "react";
import * as echarts from "echarts";

type Props = {
  option: Record<string, unknown> | null;
  insight: string | null;
};

export function ChartPlate({ option, insight }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const node = host.current;
    if (!node || !option) return;
    if (!chart.current) {
      chart.current = echarts.init(node, undefined, { renderer: "canvas" });
    }
    chart.current.setOption(option, true);
    chart.current.resize();
    const onResize = () => chart.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [option]);

  useEffect(() => {
    return () => {
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);

  return (
    <section className="plate">
      <header>
        <p className="kicker">Chart plate</p>
        <h2>ECharts from <code>suggest_chart</code></h2>
      </header>
      <div className="plate-canvas" ref={host} data-empty={!option || undefined} />
      {option && insight ? <p className="insight">{insight}</p> : null}
      {option ? null : (
        <p className="plate-empty">Ask for a chart and the tool result lands here. Nothing is drawn until MCP returns a spec.</p>
      )}
    </section>
  );
}
