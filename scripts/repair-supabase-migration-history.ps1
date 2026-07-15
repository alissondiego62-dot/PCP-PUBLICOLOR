# Publicolor 3.0.3 — alternativa oficial via Supabase CLI
# Requer: supabase login e acesso ao projeto Publicolor PCP.

$ErrorActionPreference = "Stop"
$projectRef = "cocurqdsuyfflxnieaxz"
$versions = @(
  "20260712190000"
  "20260713010000"
  "20260713090000"
  "20260713100000"
  "20260714010000"
  "20260714223000"
  "20260715010000"
  "20260715030000"
  "20260716010000"
  "20260716020000"
  "20260717010000"
  "20260718010000"
  "20260719010000"
  "20260720010000"
  "20260721010000"
  "20260722010000"
  "20260723010000"
  "20260723030000"
  "20260724010000"
  "20260725010000"
  "20260726010000"
  "20260727010000"
  "20260727030000"
  "20260728010000"
)

supabase link --project-ref $projectRef
foreach ($version in $versions) {
  Write-Host "Marcando $version como aplicada..."
  supabase migration repair $version --status applied
}

supabase migration list
