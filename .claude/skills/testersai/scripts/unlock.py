#!/usr/bin/env python3
"""
TestersAI API Key Validation System

Validates API keys against a Google Cloud Function backend and caches
the result locally for offline use.

API key format: tai_pro_[12-char-hex]
  tai_pro_a1b2c3d4e5f6 (Pro tier)
"""

import json
import re
from pathlib import Path
from datetime import datetime
from typing import Dict, Optional

# API key configuration
API_KEY_PREFIX = "tai"
API_KEY_PATTERN = re.compile(r'\btai_pro_[a-zA-Z0-9]{8,16}\b')
VALID_TIERS = {"pro"}

# GCF validation endpoint — update after deploying cloud-function/
VALIDATE_KEY_URL = "https://us-central1-taiser-476406.cloudfunctions.net/validate_key"


def validate_api_key(api_key: str, skill_path: str = None) -> Optional[str]:
    """
    Validate an API key. Checks local cache first, then calls GCF.

    Returns:
        Tier name ("pro") if valid, None if invalid
    """
    if not API_KEY_PATTERN.match(api_key):
        return None

    parts = api_key.split("_", 2)
    if len(parts) != 3:
        return None
    prefix, tier_from_key, _ = parts
    if prefix != API_KEY_PREFIX or tier_from_key not in VALID_TIERS:
        return None

    # Check local cache first
    cached = check_unlock_status(skill_path)
    if (cached.get("unlocked")
            and cached.get("api_key") == api_key
            and cached.get("tier") in VALID_TIERS):
        return cached["tier"]

    # Call GCF to validate
    try:
        import urllib.request
        import urllib.error

        req_data = json.dumps({"api_key": api_key}).encode("utf-8")
        req = urllib.request.Request(
            VALIDATE_KEY_URL,
            data=req_data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            if result.get("valid") and result.get("tier") in VALID_TIERS:
                return result["tier"]
            return None

    except Exception as e:
        print(f"API key validation error: {e}")
        # Offline fallback: trust cached key if it matches
        if cached.get("unlocked") and cached.get("api_key") == api_key:
            return cached.get("tier")
        return None


def get_unlock_file_path(skill_path: str = None) -> Path:
    """Get the path to the unlock status file."""
    if skill_path is None:
        skill_path = Path(__file__).parent.parent
    else:
        skill_path = Path(skill_path)
    return skill_path / ".unlock_status.json"


def check_unlock_status(skill_path: str = None) -> Dict:
    """
    Check if pro features are unlocked.

    Returns:
        {
            "tier": "free" | "pro",
            "unlocked": bool,
            "api_key": str | None,
            "unlocked_at": str | None,
            "validated_at": str | None
        }
    """
    unlock_file = get_unlock_file_path(skill_path)

    if unlock_file.exists():
        try:
            with open(unlock_file) as f:
                data = json.load(f)
                return {
                    "tier": data.get("tier", "free"),
                    "unlocked": data.get("unlocked", False),
                    "api_key": data.get("api_key"),
                    "unlocked_at": data.get("unlocked_at"),
                    "validated_at": data.get("validated_at"),
                }
        except Exception as e:
            print(f"Error reading unlock file: {e}")

    return {
        "tier": "free",
        "unlocked": False,
        "api_key": None,
        "unlocked_at": None,
        "validated_at": None,
    }


def store_unlock(api_key: str, tier: str, skill_path: str = None) -> bool:
    """
    Store a validated API key and activate the tier.

    Returns:
        True if successful
    """
    unlock_file = get_unlock_file_path(skill_path)

    data = {
        "tier": tier,
        "unlocked": True,
        "api_key": api_key,
        "unlocked_at": datetime.now().isoformat(),
        "validated_at": datetime.now().isoformat(),
    }

    try:
        with open(unlock_file, 'w') as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        print(f"Error storing API key: {e}")
        return False


def check_message_for_unlock(message: str, skill_path: str = None) -> Optional[Dict]:
    """
    Check if a message contains an API key and validate it.

    Returns:
        {"success": True, "tier": "pro", "message": "..."} if valid
        {"success": False, "message": "..."} if invalid key found
        None if no API key pattern found in message
    """
    match = API_KEY_PATTERN.search(message)
    if not match:
        return None

    api_key = match.group(0)
    tier = validate_api_key(api_key, skill_path)

    if tier:
        success = store_unlock(api_key, tier, skill_path)
        if success:
            return {
                "success": True,
                "tier": tier,
                "message": f"✅ {tier.upper()} features unlocked successfully!"
            }
        else:
            return {
                "success": False,
                "message": "❌ Failed to store API key. Please try again."
            }
    else:
        return {
            "success": False,
            "message": (
                "❌ Invalid API key. Please check your key and try again.\n"
                "Your key was shown on the payment confirmation page.\n"
                "Contact support@testers.ai if you need help."
            )
        }


def get_tier_message(tier: str) -> str:
    """Get formatted message about current tier and upgrade options."""
    if tier == "free":
        return """
🔓 **Upgrade to Pro**

**Current Tier**: Free (3 virtual testers, 2 personas)

**Pro Tier** ($19/month):
• All 30 specialized virtual testers
• Up to 5 diverse personas
• HTML reports with profile images
• Test case generation
• Test recording & playback
• Test export (Selenium, Cypress, Playwright, Cucumber)
• Priority support

👉 Visit https://testers.ai to upgrade.
   Your API key will appear on the confirmation page after payment.
   Paste it here to activate: `tai_pro_xxxxxxxxxxxx`

---
"""
    elif tier == "pro":
        return """
✅ **Pro Tier Active**

You have full access to all features:
• All 30 specialized virtual testers
• Up to 5 diverse personas
• HTML reports with profile images
• Test case generation
• Test recording & playback
• Test export (Selenium, Cypress, Playwright, Cucumber)
• Priority support

Thank you for being a Pro customer! 🎉

---
"""
    return ""


# CLI for testing
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage:")
        print("  python unlock.py check                  # Check current status")
        print("  python unlock.py validate <api_key>     # Validate an API key")
        print("  python unlock.py unlock <api_key>       # Activate with API key")
        print("  python unlock.py message <text>         # Test message scanning")
        sys.exit(1)

    command = sys.argv[1]

    if command == "check":
        status = check_unlock_status()
        print(json.dumps(status, indent=2))
        print(get_tier_message(status["tier"]))

    elif command == "validate":
        if len(sys.argv) < 3:
            print("Error: No API key provided")
            sys.exit(1)
        api_key = sys.argv[2]
        tier = validate_api_key(api_key)
        if tier:
            print(f"✅ Valid {tier} key")
        else:
            print("❌ Invalid key")

    elif command == "unlock":
        if len(sys.argv) < 3:
            print("Error: No API key provided")
            sys.exit(1)
        api_key = sys.argv[2]
        tier = validate_api_key(api_key)
        if tier:
            success = store_unlock(api_key, tier)
            if success:
                print(f"✅ {tier.upper()} features unlocked!")
            else:
                print("❌ Failed to store key")
        else:
            print("❌ Invalid key")

    elif command == "message":
        if len(sys.argv) < 3:
            print("Error: No message provided")
            sys.exit(1)
        message = " ".join(sys.argv[2:])
        result = check_message_for_unlock(message)
        if result:
            print(json.dumps(result, indent=2))
        else:
            print("No API key found in message")

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
