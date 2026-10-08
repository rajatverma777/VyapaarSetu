import re
from datetime import datetime, timedelta
from typing import Optional

def parse_expiry_string(expiry_str: Optional[str]) -> Optional[datetime]:
    """Parse various expiry date formats (MM/YY, MM/YYYY, ISO, etc.) into datetime."""
    if not expiry_str:
        return None
    expiry_str = expiry_str.strip()
    if not expiry_str:
        return None

    # Try ISO parse first
    try:
        return datetime.fromisoformat(expiry_str.replace("Z", "+00:00"))
    except ValueError:
        pass

    # Try MM/YY or MM-YY
    m = re.match(r"^(\d{1,2})[/\-](\d{2})$", expiry_str)
    if m:
        month = int(m.group(1))
        year = int(m.group(2)) + 2000
        try:
            if month == 12:
                return datetime(year, 12, 31)
            else:
                return datetime(year, month + 1, 1) - timedelta(seconds=1)
        except Exception:
            pass

    # Try MM/YYYY or MM-YYYY
    m = re.match(r"^(\d{1,2})[/\-](\d{4})$", expiry_str)
    if m:
        month = int(m.group(1))
        year = int(m.group(2))
        try:
            if month == 12:
                return datetime(year, 12, 31)
            else:
                return datetime(year, month + 1, 1) - timedelta(seconds=1)
        except Exception:
            pass

    # Fallback standard formats
    for fmt in (
        "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%Y-%m-%dT%H:%M:%S",
        "%b-%y", "%b-%Y", "%b/%y", "%b/%Y", "%d-%b-%Y", "%d/%b/%Y", "%d-%b-%y",
        "%d/%b/%y", "%d %b %Y", "%d %b %y", "%b %d, %Y", "%B %Y", "%b %Y",
        "%Y-%m", "%Y/%m"
    ):
        try:
            return datetime.strptime(expiry_str, fmt)
        except ValueError:
            pass

    # dateutil parser as final fallback if installed
    try:
        from dateutil.parser import parse as date_parse
        return date_parse(expiry_str)
    except Exception:
        pass

    return None
