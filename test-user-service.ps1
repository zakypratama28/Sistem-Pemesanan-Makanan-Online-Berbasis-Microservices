$ErrorActionPreference = 'Stop'

# 1. Login Customer
Write-Host "Logging in as Customer (budi@foodorder.id)..."
$custBody = @{ email = "budi@foodorder.id"; password = "password" } | ConvertTo-Json
$custRes = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1/api/auth/login" -ContentType "application/json" -Body $custBody
$custToken = $custRes.token
$hCust = @{ "Authorization" = "Bearer $custToken"; "Content-Type" = "application/json" }

# 2. Login Admin
Write-Host "`nLogging in as Admin (admin@foodorder.id)..."
$admBody = @{ email = "admin@foodorder.id"; password = "password" } | ConvertTo-Json
$admRes = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1/api/auth/login" -ContentType "application/json" -Body $admBody
$admToken = $admRes.token
$hAdm = @{ "Authorization" = "Bearer $admToken"; "Content-Type" = "application/json" }

# 3. GET /api/users/me (Customer)
Write-Host "`nGET /api/users/me (Customer Profile)"
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1/api/users/me" -Headers $hCust | ConvertTo-Json -Depth 3

# 4. PATCH /api/users/me (Customer)
Write-Host "`nPATCH /api/users/me (Update Customer Name)"
$patchBody = @{ name = "Budi Terupdate" } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "http://127.0.0.1/api/users/me" -Headers $hCust -Body $patchBody | ConvertTo-Json -Depth 3

# 5. GET /api/users (Admin)
Write-Host "`nGET /api/users (All Users - Admin)"
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1/api/users" -Headers $hAdm | ConvertTo-Json -Depth 4

# 6. GET /api/users/:id (Admin)
Write-Host "`nGET /api/users/3 (Specific User - Admin)"
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1/api/users/3" -Headers $hAdm | ConvertTo-Json -Depth 3

# 7. PATCH /api/users/:id/role (Admin)
Write-Host "`nPATCH /api/users/3/role (Change Role - Admin)"
$patchRoleBody = @{ role = "RESTAURANT_ADMIN" } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "http://127.0.0.1/api/users/3/role" -Headers $hAdm -Body $patchRoleBody | ConvertTo-Json -Depth 3

# 8. GET /api/users (Customer) -> Should Fail with 403
Write-Host "`nGET /api/users (All Users - Customer) -> Expecting 403 Forbidden"
try {
    Invoke-RestMethod -Method Get -Uri "http://127.0.0.1/api/users" -Headers $hCust
    Write-Host "WARNING: Request succeeded, but should have failed!" -ForegroundColor Red
} catch {
    Write-Host "Success! Request was forbidden: $($_.Exception.Message)" -ForegroundColor Green
}
