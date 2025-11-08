import meraki
import json

# API key and organization/network details
API_KEY = "34bfc5798f19e8dcbe9bfa125e7a512db9c8aa1a"  # Replace with your Meraki API key
NETWORK_ID = "L_743093938516145211"  # Replace with your network ID

# Initialize Meraki dashboard API client
dashboard = meraki.DashboardAPI(API_KEY)

# Step 1: Get device configuration for the MX75
devices = dashboard.networks.getNetworkDevices(NETWORK_ID)
mx75_serial = None
for device in devices:
    if device["model"] == "MX75":  # Look for the MX75 device
        mx75_serial = device["serial"]
        print(f"Found MX75 with serial: {mx75_serial}")
        break

if not mx75_serial:
    print("MX75 device not found!")
    exit()

# Step 2: Extract detailed configurations
config = {}

# Device configuration
config["device"] = dashboard.devices.getDevice(mx75_serial)

# VLANs
config["vlans"] = dashboard.appliance.getNetworkApplianceVlans(NETWORK_ID)

# Layer 3 Firewall Rules
config["l3_firewall_rules"] = dashboard.appliance.getNetworkApplianceFirewallL3FirewallRules(NETWORK_ID)

# Layer 7 Firewall Rules
config["l7_firewall_rules"] = dashboard.appliance.getNetworkApplianceFirewallL7FirewallRules(NETWORK_ID)

# Site-to-Site VPN
config["site_to_site_vpn"] = dashboard.appliance.getNetworkApplianceVpnSiteToSiteVpn(NETWORK_ID)

# Client VPN Configuration
#config["client_vpn"] = dashboard.appliance.getNetworkApplianceVpnClientVpn(NETWORK_ID)

# Traffic Shaping Rules
config["traffic_shaping"] = dashboard.appliance.getNetworkApplianceTrafficShaping(NETWORK_ID)

# Threat Protection Settings
config["threat_protection"] = dashboard.appliance.getNetworkApplianceSecurityMalware(NETWORK_ID)

# Uplink Configuration
#config["uplink_status"] = dashboard.appliance.getNetworkApplianceUplinks(network_id)


# Step 3: Save the full configuration to a JSON file
with open("mx75_full_config.json", "w") as config_file:
    json.dump(config, config_file, indent=4)
    print("Full configuration saved to mx75_full_config.json")
