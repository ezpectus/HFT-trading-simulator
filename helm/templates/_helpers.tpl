{{/*
Common labels for hft-trading-system resources.
*/}}
{{- define "hft-trading-system.labels" -}}
app.kubernetes.io/name: hft-trading-system
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{/*
Selector labels — used in matchLabels and pod labels.
*/}}
{{- define "hft-trading-system.selectorLabels" -}}
app.kubernetes.io/name: hft-trading-system
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
