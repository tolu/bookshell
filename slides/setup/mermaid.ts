import { defineMermaidSetup } from '@slidev/types'

export default defineMermaidSetup(() => ({
  theme: 'base',
  themeVariables: {
    fontFamily: '"Spectral", Georgia, serif',
    primaryColor: '#faf8f3',
    primaryTextColor: '#1a1a17',
    primaryBorderColor: '#2f4a3c',
    lineColor: '#c8a24a',
    secondaryColor: '#e6e1d6',
    tertiaryColor: '#ffffff',
    background: '#faf8f3',
    mainBkg: '#ffffff',
    nodeBorder: '#2f4a3c',
    clusterBkg: '#ffffff',
    clusterBorder: '#e6e1d6',
    edgeLabelBackground: '#faf8f3',
    actorBkg: '#ffffff',
    actorBorder: '#2f4a3c',
    actorTextColor: '#1a1a17',
    actorLineColor: '#c8a24a',
    signalColor: '#1a1a17',
    signalTextColor: '#1a1a17',
    labelBoxBkgColor: '#ffffff',
    labelBoxBorderColor: '#2f4a3c',
    labelTextColor: '#1a1a17',
  },
}))
