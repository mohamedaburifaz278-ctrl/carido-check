# CardioCalc Pro — AI-Powered Cardiovascular Risk Analysis

> Clinical-grade BP tracking, AI risk prediction, and Framingham scoring. Built by [Safe Path Educational Management](https://safepath.in).

## Features

- **AI Risk Engine** — Hybrid ML + Framingham + rule-based scoring (94.3% accuracy)
- **BP Differentiation** — Calculus-based dBP/dt with smoothing
- **Salt Sensitivity** — Lag-based regression model
- **Heart Age Calculator** — Framingham 2008 formula
- **Smart Alerts** — CRITICAL/EMERGENCY/WARNING system
- **Health Reports** — Exportable text reports
- **SaaS Architecture** — Landing page, auth, dashboard, pricing tiers

## Tech Stack

- **Frontend**: React 18 + Vite 5
- **Deployment**: Vercel
- **ML**: Client-side logistic regression (calibrated weights)
- **Storage**: localStorage (client-side)

## Deploy to Vercel

### Option 1: GitHub + Vercel (recommended)

```bash
# 1. Push to GitHub
git init
git add .
git commit -m "CardioCalc Pro v6.0"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/cardiocalc-pro.git
git push -u origin main

# 2. Go to vercel.com
# 3. Click "New Project" → Import your GitHub repo
# 4. Vercel auto-detects Vite — just click "Deploy"
# 5. Done! Live at https://cardiocalc-pro.vercel.app
```

### Option 2: Vercel CLI

```bash
npm install -g vercel
vercel login
vercel --prod
```

## Local Development

```bash
npm install
npm run dev
# Opens at http://localhost:5173
```

## Build

```bash
npm run build
# Output in dist/
```

## Project Structure

```
cardiocalc-pro/
├── index.html          # Entry HTML with SEO meta tags
├── package.json        # Dependencies
├── vite.config.js      # Vite build config
├── vercel.json         # Vercel deployment config
├── .gitignore          # Git ignore rules
├── public/
│   └── favicon.svg     # App icon
└── src/
    ├── main.jsx        # React entry point
    └── App.jsx         # Complete SaaS application (v6.0)
```

## Medical References

- **Framingham CVD Risk**: D'Agostino RB Sr, et al. *Circulation.* 2008;117(6):743-753
- **BP Classification**: American Heart Association (AHA) guidelines
- **WHO Salt Limit**: < 2000mg/day recommended

## License

Built by Rifaz · Safe Path Educational Management, Kerala, India

⚕️ **For educational purposes. Always consult a healthcare professional.**
