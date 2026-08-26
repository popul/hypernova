{{- define "hypernova.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "hypernova.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "hypernova.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "hypernova.labels" -}}
helm.sh/chart: {{ include "hypernova.chart" . }}
{{ include "hypernova.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "hypernova.selectorLabels" -}}
app.kubernetes.io/name: {{ include "hypernova.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "hypernova.image" -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) }}
{{- end }}

{{/*
L'API du panthéon. Elle porte un `app.kubernetes.io/name` distinct — et pas
seulement un `component` — parce que le Service du site sélectionne sur
name + instance : un simple label supplémentaire ne l'empêcherait pas d'attraper
les pods de l'API et d'y envoyer les visiteurs du jeu.
*/}}
{{- define "hypernova.api.fullname" -}}
{{- printf "%s-api" (include "hypernova.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "hypernova.api.selectorLabels" -}}
app.kubernetes.io/name: {{ printf "%s-api" (include "hypernova.name" .) | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: api
{{- end }}

{{- define "hypernova.api.labels" -}}
helm.sh/chart: {{ include "hypernova.chart" . }}
{{ include "hypernova.api.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "hypernova.api.image" -}}
{{- printf "%s:%s" .Values.api.image.repository (default .Chart.AppVersion .Values.api.image.tag) }}
{{- end }}
