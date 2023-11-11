export default function (context) {
    const chart = context.chart;
    const { ctx, chartArea } = chart;

    if (!chartArea) return;

    const gradient = ctx.createLinearGradient(0, chart.scales.y.getPixelForValue(0), 0, chart.scales.y.getPixelForValue(50));

    const opacity = 29;
    gradient.addColorStop(15 / 50, `#FF0000${opacity}`);
    gradient.addColorStop(15 / 50, `#FFFF00${opacity}`);
    gradient.addColorStop(25 / 50, `#FFFF00${opacity}`);
    gradient.addColorStop(25 / 50, `#00BBFF${opacity}`);

    return gradient
}