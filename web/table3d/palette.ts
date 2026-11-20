/**
 * 3D 桌面材质色板的唯一正本。
 *
 * 取值与 design-library / styles/nocturne/tokens.css 一一对应；CSS 侧由
 * web/tokens.nocturne.css 提供 --nc-*，这里提供 canvas 2D 用的字符串和
 * three.js 用的数值，避免两套色板慢慢漂移。
 *
 * 关于 textures.ts / props.ts 里剩下的暖色渐变停靠点：它们是 LAYERS.md 第 4 层
 * 的「受光面」，由主光 KEY_LIGHT 按距离衰减推导出来的中间值，不是新的色相。
 * 不要把 #FFD8A2 之类当成新颜色去改；要换灯，改 NC.primary 与这些受光面的
 * 相对亮度，版式与材质结构不动。
 */

export const NC = {
  canvas:         '#0B0A09',
  surfaceSunk:    '#070606',
  surface:        '#15120E',
  surfaceRaised:  '#1F1A14',
  surfaceLit:     '#33291D',
  ink:            '#EFE6D5',
  inkMuted:       '#A99A82',
  inkFaint:       '#7A6C59',
  hairline:       '#2B2419',
  hairlineStrong: '#443826',
  primary:        '#E8B76A', // 主光
  primarySoft:    '#2A2114',
  primaryInk:     '#1A1206',
  ember:          '#E4572E', // 只用于「正在发生」
} as const;

/** 同一组色的 three.js 数值形式。 */
export const GL = {
  canvas:         0x0b0a09,
  surfaceSunk:    0x070606,
  surface:        0x15120e,
  surfaceRaised:  0x1f1a14,
  surfaceLit:     0x33291d,
  ink:            0xefe6d5,
  inkMuted:       0xa99a82,
  inkFaint:       0x7a6c59,
  hairline:       0x2b2419,
  hairlineStrong: 0x443826,
  primary:        0xe8b76a,
  primarySoft:    0x2a2114,
  primaryInk:     0x1a1206,
  ember:          0xe4572e,
} as const;
