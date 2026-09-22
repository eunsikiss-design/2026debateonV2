// Shared compatibility aliases for existing screens. Visual tokens live in cyber.css.
tailwind.config = {
  "darkMode": "class",
  "theme": {
    "extend": {
      "colors": {
        "on-background": "rgb(var(--rgb-text) / <alpha-value>)",
        "primary-fixed": "rgb(var(--rgb-elevated) / <alpha-value>)",
        "on-error": "rgb(var(--rgb-text) / <alpha-value>)",
        "error-container": "rgb(var(--rgb-surface) / <alpha-value>)",
        "surface-tint": "rgb(var(--rgb-surface) / <alpha-value>)",
        "on-primary-container": "rgb(var(--rgb-text) / <alpha-value>)",
        "tertiary-container": "rgb(var(--rgb-elevated) / <alpha-value>)",
        "on-tertiary-fixed": "rgb(var(--rgb-text) / <alpha-value>)",
        "secondary-fixed-dim": "rgb(var(--rgb-elevated) / <alpha-value>)",
        "outline-variant": "rgb(var(--rgb-muted) / <alpha-value>)",
        "surface-container": "rgb(var(--rgb-surface) / <alpha-value>)",
        "secondary-container": "rgb(var(--rgb-elevated) / <alpha-value>)",
        "surface-container-highest": "rgb(var(--rgb-elevated) / <alpha-value>)",
        "tertiary-fixed": "rgb(var(--rgb-elevated) / <alpha-value>)",
        "on-tertiary-container": "rgb(var(--rgb-text) / <alpha-value>)",
        "on-surface-variant": "rgb(var(--rgb-muted) / <alpha-value>)",
        "surface-dim": "rgb(var(--rgb-surface) / <alpha-value>)",
        "secondary-fixed": "rgb(var(--rgb-elevated) / <alpha-value>)",
        "inverse-primary": "rgb(var(--rgb-cyan) / <alpha-value>)",
        "on-primary-fixed": "rgb(var(--rgb-text) / <alpha-value>)",
        "primary-fixed-dim": "rgb(var(--rgb-elevated) / <alpha-value>)",
        "surface-bright": "rgb(var(--rgb-surface) / <alpha-value>)",
        "surface-container-high": "rgb(var(--rgb-elevated) / <alpha-value>)",
        "primary": "rgb(var(--rgb-cyan) / <alpha-value>)",
        "surface-container-lowest": "rgb(var(--rgb-surface) / <alpha-value>)",
        "on-primary-fixed-variant": "rgb(var(--rgb-text) / <alpha-value>)",
        "on-secondary-container": "rgb(var(--rgb-text) / <alpha-value>)",
        "outline": "rgb(var(--rgb-muted) / <alpha-value>)",
        "background": "rgb(var(--rgb-void) / <alpha-value>)",
        "secondary": "rgb(var(--rgb-cyan) / <alpha-value>)",
        "on-tertiary": "rgb(var(--rgb-text) / <alpha-value>)",
        "surface-container-low": "rgb(var(--rgb-surface) / <alpha-value>)",
        "inverse-surface": "rgb(var(--rgb-surface) / <alpha-value>)",
        "primary-container": "rgb(var(--rgb-elevated) / <alpha-value>)",
        "surface": "rgb(var(--rgb-void) / <alpha-value>)",
        "on-surface": "rgb(var(--rgb-text) / <alpha-value>)",
        "inverse-on-surface": "rgb(var(--rgb-surface) / <alpha-value>)",
        "error": "rgb(var(--rgb-danger) / <alpha-value>)",
        "on-primary": "rgb(var(--rgb-void) / <alpha-value>)",
        "on-secondary": "rgb(var(--rgb-text) / <alpha-value>)",
        "tertiary": "rgb(var(--rgb-warning) / <alpha-value>)",
        "on-secondary-fixed-variant": "rgb(var(--rgb-text) / <alpha-value>)",
        "on-secondary-fixed": "rgb(var(--rgb-text) / <alpha-value>)",
        "on-error-container": "rgb(var(--rgb-text) / <alpha-value>)",
        "surface-variant": "rgb(var(--rgb-surface) / <alpha-value>)",
        "tertiary-fixed-dim": "rgb(var(--rgb-elevated) / <alpha-value>)",
        "on-tertiary-fixed-variant": "rgb(var(--rgb-text) / <alpha-value>)"
      },
      "borderRadius": {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      "spacing": {
        "space-xl": "2.5rem",
        "space-lg": "1.5rem",
        "space-xs": "0.25rem",
        "space-sm": "0.5rem",
        "margin": "16px",
        "space-md": "1rem",
        "gutter": "16px"
      },
      "fontFamily": {
        "display-lg-mobile": [
          "Plus Jakarta Sans",
          "Pretendard",
          "Noto Sans KR",
          "sans-serif"
        ],
        "headline-sm": [
          "Plus Jakarta Sans",
          "Pretendard",
          "Noto Sans KR",
          "sans-serif"
        ],
        "code-argument": [
          "JetBrains Mono",
          "monospace"
        ],
        "label-sm": [
          "Plus Jakarta Sans",
          "Pretendard",
          "Noto Sans KR",
          "sans-serif"
        ],
        "body-md": [
          "Plus Jakarta Sans",
          "Pretendard",
          "Noto Sans KR",
          "sans-serif"
        ],
        "body-xl": [
          "Plus Jakarta Sans",
          "Pretendard",
          "Noto Sans KR",
          "sans-serif"
        ],
        "body-lg": [
          "Plus Jakarta Sans",
          "Pretendard",
          "Noto Sans KR",
          "sans-serif"
        ],
        "label-lg": [
          "Plus Jakarta Sans",
          "Pretendard",
          "Noto Sans KR",
          "sans-serif"
        ],
        "display-lg": [
          "Plus Jakarta Sans",
          "Pretendard",
          "Noto Sans KR",
          "sans-serif"
        ],
        "headline-lg": [
          "Plus Jakarta Sans",
          "Pretendard",
          "Noto Sans KR",
          "sans-serif"
        ],
        "headline-md": [
          "Plus Jakarta Sans",
          "Pretendard",
          "Noto Sans KR",
          "sans-serif"
        ],
        "label-md": [
          "Plus Jakarta Sans",
          "Pretendard",
          "Noto Sans KR",
          "sans-serif"
        ],
        "body-sm": [
          "Plus Jakarta Sans",
          "Pretendard",
          "Noto Sans KR",
          "sans-serif"
        ],
        "headline": [
          "Plus Jakarta Sans",
          "Pretendard",
          "Noto Sans KR",
          "sans-serif"
        ],
        "display": [
          "Plus Jakarta Sans",
          "Pretendard",
          "Noto Sans KR",
          "sans-serif"
        ],
        "body": [
          "Plus Jakarta Sans",
          "Pretendard",
          "Noto Sans KR",
          "sans-serif"
        ],
        "label": [
          "Plus Jakarta Sans",
          "Pretendard",
          "Noto Sans KR",
          "sans-serif"
        ],
        "mono": [
          "JetBrains Mono",
          "monospace"
        ]
      },
      "fontSize": {
        "display-lg-mobile": [
          "30px",
          {
            "lineHeight": "40px",
            "letterSpacing": "-0.025em",
            "fontWeight": "800"
          }
        ],
        "headline-sm": [
          "18px",
          {
            "lineHeight": "26px",
            "letterSpacing": "-0.01em",
            "fontWeight": "600"
          }
        ],
        "code-argument": [
          "13px",
          {
            "lineHeight": "20px",
            "fontWeight": "500"
          }
        ],
        "label-sm": [
          "11px",
          {
            "lineHeight": "14px",
            "letterSpacing": "0.04em",
            "fontWeight": "700"
          }
        ],
        "body-md": [
          "14px",
          {
            "lineHeight": "22px",
            "letterSpacing": "-0.005em",
            "fontWeight": "400"
          }
        ],
        "body-xl": [
          "18px",
          {
            "lineHeight": "30px",
            "letterSpacing": "-0.01em",
            "fontWeight": "400"
          }
        ],
        "body-lg": [
          "16px",
          {
            "lineHeight": "26px",
            "letterSpacing": "-0.01em",
            "fontWeight": "400"
          }
        ],
        "label-lg": [
          "14px",
          {
            "lineHeight": "18px",
            "letterSpacing": "0.01em",
            "fontWeight": "600"
          }
        ],
        "display-lg": [
          "40px",
          {
            "lineHeight": "52px",
            "letterSpacing": "-0.03em",
            "fontWeight": "800"
          }
        ],
        "headline-lg": [
          "28px",
          {
            "lineHeight": "38px",
            "letterSpacing": "-0.02em",
            "fontWeight": "700"
          }
        ],
        "headline-md": [
          "22px",
          {
            "lineHeight": "30px",
            "letterSpacing": "-0.015em",
            "fontWeight": "700"
          }
        ],
        "label-md": [
          "12px",
          {
            "lineHeight": "16px",
            "letterSpacing": "0.02em",
            "fontWeight": "600"
          }
        ],
        "body-sm": [
          "13px",
          {
            "lineHeight": "20px",
            "fontWeight": "400"
          }
        ]
      }
    }
  }
};

