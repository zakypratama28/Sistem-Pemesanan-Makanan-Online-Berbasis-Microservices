$ErrorActionPreference = 'Stop'

Write-Host "Starting WebSocket client in background..."
Start-Process -FilePath "node" -ArgumentList "test-ws.js" -RedirectStandardOutput "ws-output.log" -RedirectStandardError "ws-error.log" -NoNewWindow
Start-Sleep -Seconds 2

# 1. Login Customer
Write-Host "Logging in as Customer..."
$custBody = @{ email = "budi@foodorder.id"; password = "password" } | ConvertTo-Json
$custRes = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1/api/auth/login" -ContentType "application/json" -Body $custBody
$custToken = $custRes.token

$hCust = @{ "Authorization" = "Bearer $custToken"; "Content-Type" = "application/json" }

# 2. Login Admin
Write-Host "Logging in as Admin..."
$adminBody = @{ email = "admin@foodorder.id"; password = "password" } | ConvertTo-Json
$adminRes = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1/api/auth/login" -ContentType "application/json" -Body $adminBody
$adminToken = $adminRes.token
$hAdmin = @{ "Authorization" = "Bearer $adminToken"; "Content-Type" = "application/json" }

# 3. Create Order
Write-Host "Creating Order..."
$orderBody = @{
    restaurant_id = 1
    items = @(
        @{ menu_id = 1; quantity = 2; price = 20000 }
    )
} | ConvertTo-Json -Depth 5
$orderRes = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1/api/orders" -Headers $hCust -Body $orderBody
$orderId = $orderRes.data.id
Write-Host "Order Created: $orderId"

# 4. Pay Order
Write-Host "Paying Order..."
$payBody = @{ order_id = $orderId; amount = 40000; payment_method = "EWALLET" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1/api/payments" -Headers $hCust -Body $payBody | Out-Null
Write-Host "Order Paid"

# 5. Update Status to COOKING
Write-Host "Updating Order Status..."
$statusBody = @{ status = "COOKING" } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "http://127.0.0.1/api/orders/$orderId/status" -Headers $hAdmin -Body $statusBody | Out-Null
Write-Host "Order Status Updated"

# 6. Wait for WS events
Write-Host "Waiting for events..."
Start-Sleep -Seconds 3

# 7. Kill node processes
Write-Host "Stopping WS client..."
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "test-ws.js" } | Stop-Process -Force

# 8. Output logs
Write-Host "================== WS OUTPUT =================="
Get-Content "ws-output.log"
Write-Host "==============================================="
