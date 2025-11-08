New-Item -Path 'C:\Reports' -ItemType Directory -Force | Out-Null
$apiKey = '4a0051e3b57aeec61914c8eeac2770a8f97718b8'    # <-- DO NOT SHARE THIS KEY
$orgId = '743093938516132330'
$netId = 'BemRLdaf'         # MX network ID
$base = 'https://api.meraki.com/api/v1'
$h = @{ 'X-Cisco-Meraki-API-Key' = $apiKey; 'Content-Type' = 'application/json' }

# Inventory
Invoke-RestMethod -Uri "$base/organizations" -Headers $h |
ConvertTo-Json -Depth 5 | Out-File C:\Reports\MK_Organizations.json

Invoke-RestMethod -Uri "$base/organizations/$orgId/networks" -Headers $h |
ConvertTo-Json -Depth 5 | Out-File C:\Reports\MK_Networks.json

# MX L3 and L7 firewall rules
Invoke-RestMethod -Uri "$base/networks/$netId/appliance/firewall/l3FirewallRules" -Headers $h |
ConvertTo-Json -Depth 8 | Out-File C:\Reports\MK_MX_L3FirewallRules.json

Invoke-RestMethod -Uri "$base/networks/$netId/appliance/firewall/l7FirewallRules" -Headers $h |
ConvertTo-Json -Depth 8 | Out-File C:\Reports\MK_MX_L7FirewallRules.json

# Port forwarding / NAT (exposes RDP/SQL if present)
Invoke-RestMethod -Uri "$base/networks/$netId/appliance/portForwardingRules" -Headers $h |
ConvertTo-Json -Depth 8 | Out-File C:\Reports\MK_MX_PortForwarding.json

# Client VPN + Site-to-Site peers (ingress/egress paths)
Invoke-RestMethod -Uri "$base/networks/$netId/appliance/vpn/siteToSiteVpn" -Headers $h |
ConvertTo-Json -Depth 8 | Out-File C:\Reports\MK_MX_SiteToSiteVPN.json

Invoke-RestMethod -Uri "$base/networks/$netId/appliance/vpn/thirdPartyVPNPeers" -Headers $h |
ConvertTo-Json -Depth 8 | Out-File C:\Reports\MK_MX_ThirdPartyVPNPeers.json

# Recent events: blocks + flows mentioning teamviewer/anydesk (last 24h)
$since = (Get-Date).AddDays(-1).ToString('o')
Invoke-RestMethod -Uri "$base/networks/$netId/events?productType=appliance&perPage=1000&startingAfter=$since" -Headers $h |
ConvertTo-Json -Depth 12 | Out-File C:\Reports\MK_MX_Events.json

Pause
