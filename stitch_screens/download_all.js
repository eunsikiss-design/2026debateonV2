const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const targetDir = path.resolve('d:/2026-2학기/웹앱/stitch_screens');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// 1. Design System
const projectJsonPath = 'C:/Users/user/.gemini/antigravity-ide/brain/4ca90ba7-1deb-40eb-b124-495d34b928dd/.system_generated/steps/13/output.txt';
const projectData = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));

// Save Design System Markdown & JSON
const designMd = projectData.designTheme.designMd;
fs.writeFileSync(path.join(targetDir, '01_design_system.md'), designMd, 'utf8');

const designSystemJson = {
  name: "assets/43401df6c97a479d90e4b1bb2533d2d1",
  displayName: "Socratic Slate",
  colorMode: projectData.designTheme.colorMode,
  customColor: projectData.designTheme.customColor,
  namedColors: projectData.designTheme.namedColors,
  typography: projectData.designTheme.typography,
  spacing: projectData.designTheme.spacing,
  rounded: {
    sm: "0.25rem",
    DEFAULT: "0.5rem",
    md: "0.75rem",
    lg: "1rem",
    xl: "1.5rem",
    full: "9999px"
  }
};
fs.writeFileSync(path.join(targetDir, '01_design_system.json'), JSON.stringify(designSystemJson, null, 2), 'utf8');
console.log('Saved 01_design_system.md and 01_design_system.json');

// List of downloads
const downloads = [
  // 2. Avatar Boy
  {
    type: 'image',
    filename: '02_avatar_boy_ansan_gangseo.png',
    url: 'https://lh3.googleusercontent.com/aida/AEtjO1VLg3cgddxScXyvlUjFQGJaT5dA4y0uURIEVsh4a0wvscirVzEBIPyvgJgp8uPF-M_jOPlfwe31sBlnOVpqx-7daa_hC_jHytKADLFOn9RCIrfP07JXhX1--F_PLBGSlMsRxWdrBZ0ir39Qm3_QBpFFA1x46nkJI1Bh6LU986wj__FhZq5Q2MJWeznE37cgYT0Y-ZdB1RuVNqjUT6VwWfoRCWVPVD2SOdkfIJs4o6EFgoxDVYOGH53vqBZP'
  },
  // 3. Avatar Girl
  {
    type: 'image',
    filename: '03_avatar_girl_ansan_gangseo.png',
    url: 'https://lh3.googleusercontent.com/aida/AEtjO1UHsZTKVFNlFeXcveZrKmWrYj5edg6X2bRgJ5ku6wzSdy95murUhQqcnmKI3shZ96zLOv9oGhUuqGtGVxXetQ9Wl3jtBqzSKMaVmGktuux3A2XtPnc5OKcUq0C607wRefcGYEztVnGR_3w5CaVhRMnf-uSjfuLu03N48ElMmlZ6oJhIJxAglBEv9lhSEjFb3MfQx1apQUrdWhLNdyDo1Wn5t6lheNrwZN8bpGf3Flp5MHNBwpwYKq2c4Nu-'
  },
  // 4. 로그인 및 회원가입
  {
    type: 'image',
    filename: '04_login_signup.png',
    url: 'https://lh3.googleusercontent.com/aida/AEtjO1WwZxQ6LWaAK_BgNC8JxtVF2lLjC_Aammqu7CfWotUwJqF7nCvTm1XZcXMKQoJrCx_kzcbfwRibMPFWQ4LmiG0988ySVdMpy_toqnX8jZJTScM8wgbMYGk23V_wPoF71acogxltjiq0A0qoLVqPgmQ3eJtV0dybEpq16-WHOhDEpzt8U4Es_Zc2jpFt_3mQG7dIpuFThcM3MIX4t48GVI_lmWTvqjEoSug9QozPQlI_yYG18e4y6htSKc1d'
  },
  {
    type: 'html',
    filename: '04_login_signup.html',
    url: 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1YmMzZTY4ZWRhZjMwMzMyY2ZkZTU0MTk5ZjdmEgsSBxD7j_3mzwkYAZIBJAoKcHJvamVjdF9pZBIWQhQxMTM4ODY4MjM1Mjk2NTA5OTU0Mw&filename=&opi=89354086'
  },
  // 5. AI 기초 연습실
  {
    type: 'image',
    filename: '05_ai_basic_practice.png',
    url: 'https://lh3.googleusercontent.com/aida/AEtjO1WfcJgAA0HElGfsXMwAcIfd8uG9Ft35N6f2Bqw6fDSE_45IZKR2mNgkoWnxNhk08qOcKmmy9caZZapbNkUgmQe9jMhHBsXyndDmsZIh6t43CkP9xMq9UWi3YDRL02O2UpJuUw9UplKN2PnVbgSq0PZSWNbCml6G-DyrhHAnSmsrrIFZnggJHaH-6nkB1E7khZjTx-H-ba_fOzT57K6oDsLcYMuJYZifQTCBXP4K4canXHzZJDDapk8ct3DV'
  },
  {
    type: 'html',
    filename: '05_ai_basic_practice.html',
    url: 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1YmMzZTY4MDJlYzAwN2ZlZTFiYThkMzE2M2Q0EgsSBxD7j_3mzwkYAZIBJAoKcHJvamVjdF9pZBIWQhQxMTM4ODY4MjM1Mjk2NTA5OTU0Mw&filename=&opi=89354086'
  },
  // 6. AI 심화 연습실
  {
    type: 'image',
    filename: '06_ai_advanced_practice.png',
    url: 'https://lh3.googleusercontent.com/aida/AEtjO1UpLvv7GUlOdLOr9rTkJtvQ32TWw4XQF6LogRA6avZhwdAti4MNQ24t_8lMlNobF0qFaXxylrrDJRPiqEglIlTYaQJnqtMacaAYr0ToWngr8bmxqWAbRMcYGkwnNqmPeadxRrt9giPwGJODPcWbKqjKlNh2qI5a4AuUglkZD-M8MHlKp683rWxIXLMz_XAz2UdlVuA_9dOlTEhBUPmDCBZoH3a3-QYV9dkknYs43gtGjZQY-V9P3d1baUir'
  },
  {
    type: 'html',
    filename: '06_ai_advanced_practice.html',
    url: 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1YmMzZTY2MmExMDYwODlhZjY1ZDE0MmMwNTgyEgsSBxD7j_3mzwkYAZIBJAoKcHJvamVjdF9pZBIWQhQxMTM4ODY4MjM1Mjk2NTA5OTU0Mw&filename=&opi=89354086'
  },
  // 7. 역량 분석 & 성장 기록 리포트
  {
    type: 'image',
    filename: '07_competency_report.png',
    url: 'https://lh3.googleusercontent.com/aida/AEtjO1Uc06Mp4T9LnVbhHeteQEw9mlM1h0E2bzD-EOVNgQk5BRA5n52pBV97Vbo9iK9PLfFn3hOoyNQdHJPRuXgFzDy7WMsnH9-APQnCT_-8EL_6xZCO-LDHqwZ9rA4dzUzFVnPRVzFgdno-8m0prVFsfcwPlR26pBc7LW5XVMaz94K2DVlOX-t4MpxLABjAJAebY-H1tGPUigHtd21YxwamWCysO3NeFz61WYuNe4KruEKizzB2QHHFMtgw-oUT'
  },
  {
    type: 'html',
    filename: '07_competency_report.html',
    url: 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1YmMzZTY2ZmUxMTkwMmQzYzI5MjIxMjBlZDMzEgsSBxD7j_3mzwkYAZIBJAoKcHJvamVjdF9pZBIWQhQxMTM4ODY4MjM1Mjk2NTA5OTU0Mw&filename=&opi=89354086'
  },
  // 8. 스피치 타이머 설정 & 훈련 연습실
  {
    type: 'image',
    filename: '08_speech_timer_training.png',
    url: 'https://lh3.googleusercontent.com/aida/AEtjO1WDa5Z-XYVywMpzVkocS0AZOQ8MN582FQi6mhD_0RNGhstMlCG-FQghNB1lIgYi9Dl4hINRvzLAAWkVHeKIuNxW3VKCNYQzKOe3tqjqXw58hFL13W4wd4jC3LYkGwysWktgeKOaoakS6HDNxDiKmGe3DwtQ4ips9N_DlbUmbziSL0vRUccQukY-qLgarHL0b5RyeKok8dtgacqlninpgt8YkxlHOXHduWwdWbL8ye-wjJthxdwn6uPTOGYY'
  },
  {
    type: 'html',
    filename: '08_speech_timer_training.html',
    url: 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1YmMzZTY0ZmQxODMwMmQzZmM3NDMxMWViMGQzEgsSBxD7j_3mzwkYAZIBJAoKcHJvamVjdF9pZBIWQhQxMTM4ODY4MjM1Mjk2NTA5OTU0Mw&filename=&opi=89354086'
  },
  // 9. 학급 실시간 토론 배틀룸
  {
    type: 'image',
    filename: '09_class_debate_battle.png',
    url: 'https://lh3.googleusercontent.com/aida/AEtjO1Xpn-xRR68Yrf0BFQIWmixXKAVgH0FQZTdsxewCiapea37z8rZOZ_iE66v44B1B-gds3AWKeUWeBdj40UadTpeCYFmGyI9fO8yN9y7DOnRMs3sAp6nUYvlChGancFasNK6fkDKU-7BtcRh61A0l3mk9v0gJsstRR-jDUx1XXNM2K53M7Rfwjnu7VLULZTaXkEOuv4RYybqmA-MhctOk8pXCyrp_1pdhYrXZG4TyIY3IJLvray8HCucd9NI'
  },
  {
    type: 'html',
    filename: '09_class_debate_battle.html',
    url: 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1YmMzZTY0MGI4MzUwMmQzYzI5MjIxMjBlZDMzEgsSBxD7j_3mzwkYAZIBJAoKcHJvamVjdF9pZBIWQhQxMTM4ODY4MjM1Mjk2NTA5OTU0Mw&filename=&opi=89354086'
  },
  // Extras
  {
    type: 'extra-image',
    filename: 'brand_logo_debateon_1.png',
    url: 'https://lh3.googleusercontent.com/aida/AEtjO1W66FIX126VCC2C3aYDfQstuLtyyr5VYlUl-Q73UYJnxmDEgBxyIZsL8aYz8VD_uU1AsZOVE44KwJnC5x4p1MiRbPBcejp0BM1IrELNa6i2ZV3hwFTyLL06Gl4X2ZgyLYM3q0vtl2afjz-dGgkgbHPO-H34PI3um_1H5vhoyZ_vnyksdqEuBByBo7VyU2eyZ9Cgef9r0_OWzWdj-7wCoydwTiKRB6JfFfc-O6y0S5wB0JXpO7AlTXpl-SDO'
  },
  {
    type: 'extra-image',
    filename: 'brand_logo_debateon_2.png',
    url: 'https://lh3.googleusercontent.com/aida/AEtjO1XyZmUrvn5hPRA2e-JY22KpaRzfvsw4IlOVMzIyeevpXgp_64zmI5c1bL-a5tSAIDR20c7WA4xT94msaEnQTBbkVH55EIW-Ln2A23ISEDdTew4NB4nzQwQMhS9k8QUl22z34f9BPMyl14cO5A6PPL2g3TVz9vgJCasVT7rBWk8tVnrmv06yKCOUe6h3NjU-plcAZdG9sufYCT04hdDiI8gYEjrSvr9Z943_ztv8zp5OMjunt2SrQJOElaU_'
  }
];

for (const item of downloads) {
  const dest = path.join(targetDir, item.filename);
  console.log(`Downloading ${item.filename} using curl.exe -L ...`);
  const cmd = `curl.exe -L -s -S -o "${dest}" "${item.url}"`;
  try {
    execSync(cmd, { stdio: 'inherit' });
    const stats = fs.statSync(dest);
    console.log(`✓ Finished ${item.filename} (${stats.size} bytes)`);
  } catch (err) {
    console.error(`✗ Error downloading ${item.filename}:`, err.message);
  }
}

console.log('All downloads completed!');

