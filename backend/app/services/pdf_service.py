"""
Futuristic Sales Invoice PDF Generator — Care Pharma Edition
Clean, professional design using Arial TTF for ₹ symbol support.
"""

from reportlab.lib.pagesizes import A5, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, NextPageTemplate,
    Table, TableStyle, Paragraph, Spacer, HRFlowable, Image, KeepTogether, PageBreak
)
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from reportlab.platypus.flowables import Flowable
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from app.core.config import settings
from datetime import datetime
import os

# ── Register Unicode-capable fonts (supports ₹ symbol) ───────────────────────
_ARIAL_PATH      = "/System/Library/Fonts/Supplemental/Arial.ttf"
_ARIAL_BOLD_PATH = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
_FONTS_REGISTERED = False

def _register_fonts():
    global _FONTS_REGISTERED
    if _FONTS_REGISTERED:
        return
    try:
        pdfmetrics.registerFont(TTFont("ArialCP", _ARIAL_PATH))
        pdfmetrics.registerFont(TTFont("ArialCP-Bold", _ARIAL_BOLD_PATH))
        _FONTS_REGISTERED = True
    except Exception:
        pass  # fallback to Helvetica silently

_register_fonts()

def _R(bold=False):
    """Return available font name (Arial preferred for ₹ support)."""
    if _FONTS_REGISTERED:
        return "ArialCP-Bold" if bold else "ArialCP"
    return "Helvetica-Bold" if bold else "Helvetica"

def _rupee(v):
    """Format Indian currency — use Rs."""
    return f"Rs.{v:,.2f}"

# ── Brand Palette ─────────────────────────────────────────────────────────────
NAVY       = colors.HexColor("#0d1b3e")
ROYAL      = colors.HexColor("#1a3a8f")
TEAL       = colors.HexColor("#0ea5e9")
GREEN      = colors.HexColor("#16a34a")
GREEN_DARK = colors.HexColor("#14532d")
LIGHT_BG   = colors.HexColor("#f0f7ff")
DIVIDER    = colors.HexColor("#cbd5e1")
SILVER     = colors.HexColor("#94a3b8")
GREY       = colors.HexColor("#64748b")
WHITE      = colors.white
RED        = colors.HexColor("#dc2626")

# ── Liquid Glass Palette ──────────────────────────────────────────────────────
GLASS_BG       = colors.Color(248/255, 250/255, 252/255, 0.4)   # 40% opacity light slate
GLASS_BORDER   = colors.HexColor("#cbd5e1")
GLASS_ACCENT   = colors.HexColor("#6366f1")
GLASS_TOTAL_BG = colors.Color(224/255, 231/255, 255/255, 0.75)  # 75% opacity indigo-tinted glass
GLASS_TOTAL_TX = colors.HexColor("#312e81")

# Row/Table glass styles
WHITE_GLAZED   = colors.Color(1, 1, 1, 0.15)                    # 15% opacity white
ROW_ALT_GLAZED = colors.Color(248/255, 250/255, 252/255, 0.3)   # 30% opacity
TOTAL_COL_GLAZED = colors.Color(99/255, 102/255, 241/255, 0.05)  # 5% opacity transparent indigo
GLASS_HDR_BG   = colors.Color(248/255, 250/255, 252/255, 0.7)   # 70% opacity for table header


LOGO_PATH  = os.path.join(os.path.dirname(__file__), "..", "static", "care_pharma_logo.png")
LOGO_TRANS_PATH = os.path.join(os.path.dirname(__file__), "..", "static", "care_pharma_logo_transparent.png")
CREST_PATH = os.path.join(os.path.dirname(__file__), "..", "static", "care_pharma_crest.png")


# ── Gradient header flowable ──────────────────────────────────────────────────
class GradientRect(Flowable):
    def __init__(self, width, height, c_start, c_end):
        super().__init__()
        self.width, self.height = width, height
        self.c_start, self.c_end = c_start, c_end

    def draw(self):
        steps = 80
        for i in range(steps):
            t = i / steps
            r = self.c_start.red   + t * (self.c_end.red   - self.c_start.red)
            g = self.c_start.green + t * (self.c_end.green - self.c_start.green)
            b = self.c_start.blue  + t * (self.c_end.blue  - self.c_start.blue)
            self.canv.setFillColorRGB(r, g, b)
            x = i * (self.width / steps)
            self.canv.rect(x, 0, self.width / steps + 1, self.height, fill=1, stroke=0)


# ── Flowable container to anchor child exactly to bottom of page ──────────────
class BottomAnchoredFlowable(Flowable):
    def __init__(self, child):
        super().__init__()
        self.child = child
        self.width = 0
        self.height = 0

    def wrap(self, availWidth, availHeight):
        child_w, child_h = self.child.wrap(availWidth, availHeight)
        self.width = availWidth
        if availHeight < child_h:
            # Child doesn't fit on current page, force page break
            self.height = child_h
        else:
            # Take up all remaining height to push the child to the bottom of page
            self.height = availHeight
        return self.width, self.height

    def draw(self):
        # Draw child at y=0 (which corresponds to bottomMargin on the page)
        self.child.drawOn(self.canv, 0, 0)


# ── Custom Flowable to render a beautifully rounded Grand Total cell ──────────
class GrandTotalCell(Flowable):
    def __init__(self, paragraph, bg_color, border_color, radius=1.5 * mm):
        super().__init__()
        self.paragraph = paragraph
        self.bg_color = bg_color
        self.border_color = border_color
        self.radius = radius

    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        # Wrap paragraph with a small horizontal padding (reduced to 2mm for more space)
        p_w, p_h = self.paragraph.wrap(availWidth - 2 * mm, availHeight)
        self.height = p_h + 6
        return self.width, self.height

    def draw(self):
        self.canv.saveState()
        self.canv.setFillColor(self.bg_color)
        self.canv.setStrokeColor(self.border_color)
        self.canv.setLineWidth(0.75)
        # Inset slightly by 0.5 * mm to prevent clipping at the outer card border
        inset = 0.5 * mm
        self.canv.roundRect(inset, inset, self.width - 2 * inset, self.height - 2 * inset, self.radius, fill=1, stroke=1)
        # Draw paragraph centered
        p_w, p_h = self.paragraph.width, self.paragraph.height
        y_pos = (self.height - p_h) / 2
        self.paragraph.drawOn(self.canv, 1 * mm, y_pos)
        self.canv.restoreState()


# ── Custom Flowable to render a beautifully rounded capsule button for the header title ──────────
class CapsuleCell(Flowable):
    def __init__(self, paragraph, bg_color, border_color, width=32 * mm, height=6.5 * mm, radius=None):
        super().__init__()
        self.paragraph = paragraph
        self.bg_color = bg_color
        self.border_color = border_color
        self.width = width
        self.height = height
        self.radius = radius if radius is not None else height / 2

    def wrap(self, availWidth, availHeight):
        self.paragraph.wrap(self.width - 4 * mm, self.height)
        return self.width, self.height

    def draw(self):
        self.canv.saveState()
        self.canv.setFillColor(self.bg_color)
        self.canv.setStrokeColor(self.border_color)
        self.canv.setLineWidth(0.5)
        # Draw capsule
        self.canv.roundRect(0, 0, self.width, self.height, self.radius, fill=1, stroke=1)
        p_w, p_h = self.paragraph.width, self.paragraph.height
        x_pos = (self.width - p_w) / 2
        y_pos = (self.height - p_h) / 2
        self.paragraph.drawOn(self.canv, x_pos, y_pos)
        self.canv.restoreState()


# ── Rounded card & border drawing helpers ──────────────────────────────────────
def make_rounded_path(canvas, x, y, w, h, r):
    p = canvas.beginPath()
    # Using precise Bezier constant for a circular arc: 4*(sqrt(2)-1)/3 ~ 0.5522847
    k = 0.5522847 * r
    p.moveTo(x + r, y)
    p.lineTo(x + w - r, y)
    # Bottom-right corner
    p.curveTo(x + w - r + k, y, x + w, y + r - k, x + w, y + r)
    p.lineTo(x + w, y + h - r)
    # Top-right corner
    p.curveTo(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h)
    p.lineTo(x + r, y + h)
    # Top-left corner
    p.curveTo(x + r - k, y + h, x, y + h - r + k, x, y + h - r)
    p.lineTo(x, y + r)
    # Bottom-left corner
    p.curveTo(x, y + r - k, x + r - k, y, x + r, y)
    p.close()
    return p


class RoundedCard(Flowable):
    def __init__(self, flowable, bg_color=None, border_color=None, border_width=0.5, radius=5, space_before=0, space_after=0):
        super().__init__()
        self.flowable = flowable
        self.bg_color = bg_color
        self.border_color = border_color
        self.border_width = border_width
        self.radius = radius
        self.spaceBefore = space_before
        self.spaceAfter = space_after


    def wrap(self, availWidth, availHeight):
        self.width, self.height = self.flowable.wrap(availWidth, availHeight)
        return self.width, self.height

    def draw(self):
        self.canv.saveState()
        
        # 1. Draw rounded card background and border
        if self.bg_color or self.border_color:
            self.canv.setFillColor(self.bg_color or colors.transparent)
            self.canv.setStrokeColor(self.border_color or colors.transparent)
            self.canv.setLineWidth(self.border_width)
            path = make_rounded_path(self.canv, 0, 0, self.width, self.height, self.radius)
            self.canv.drawPath(path, fill=1 if self.bg_color else 0, stroke=1 if self.border_color else 0)
        
        # 2. Clip children to rounded boundary
        clip_path = make_rounded_path(self.canv, 0, 0, self.width, self.height, self.radius)
        self.canv.clipPath(clip_path, stroke=0, fill=0)
        
        # 3. Draw child
        self.flowable.drawOn(self.canv, 0, 0)
        
        self.canv.restoreState()


class UnifiedInvoiceBox(Flowable):
    def __init__(self, items, summary_table, is_igst, col_w, col_hdrs, table_style, bg_color, border_color, border_width=0.5, radius=3*mm, is_last_page=True, start_idx=1):
        super().__init__()
        self.items = items
        self.summary_table = summary_table
        self.is_igst = is_igst
        self.col_w = col_w
        self.col_hdrs = col_hdrs
        self.table_style = table_style
        self.bg_color = bg_color
        self.border_color = border_color
        self.border_width = border_width
        self.radius = radius
        self.is_last_page = is_last_page
        self.start_idx = start_idx
        self.width = 198 * mm
        self.height = 0
        self._build_table()

    def _build_table(self):
        f, fb = _R(), _R(True)
        rows = [self.col_hdrs]
        for i, item in enumerate(self.items):
            idx = self.start_idx + i
            name   = item.get("product_name", "")
            qty    = item.get("quantity", 0)
            unit   = item.get("unit", "PCS")
            rate   = item.get("rate", 0)
            taxable= item.get("taxable_amount", 0)
            total  = item.get("total_amount", 0)

            # Using a fully unique style name per item/box
            p_style = ParagraphStyle(
                f"IP_U_{id(self)}_{idx}", fontName=f, fontSize=6.5, textColor=NAVY, leading=8)
            name_para = Paragraph(name, p_style)

            qty_str = f"{qty:.0f}" if qty == int(qty) else f"{qty:.2f}"

            def _c(text, bold=False, right=False, center=False):
                align = TA_RIGHT if right else (TA_CENTER if center else TA_LEFT)
                fn = fb if bold else f
                return Paragraph(str(text), ParagraphStyle(
                    f"C_U_{id(self)}_{idx}_{bold}_{right}", fontName=fn, fontSize=6.5,
                    textColor=NAVY, alignment=align, leading=8))

            if self.is_igst:
                rows.append([
                    _c(idx, center=True),
                    name_para,
                    _c(qty_str, center=True),
                    _c(unit, center=True),
                    _c(_rupee(rate), right=True),
                    _c(_rupee(taxable), right=True),
                    _c(f"{item.get('igst_rate', 0):.0f}%" if item.get('igst_rate', 0) == int(item.get('igst_rate', 0)) else f"{item.get('igst_rate', 0):.1f}%", center=True),
                    _c(_rupee(item.get("igst_amount", 0)), right=True),
                    _c(_rupee(total), bold=True, right=True),
                ])
            else:
                rows.append([
                    _c(idx, center=True),
                    name_para,
                    _c(qty_str, center=True),
                    _c(unit, center=True),
                    _c(_rupee(rate), right=True),
                    _c(_rupee(taxable), right=True),
                    _c(f"{item.get('gst_rate', 0):.0f}%" if item.get('gst_rate', 0) == int(item.get('gst_rate', 0)) else f"{item.get('gst_rate', 0):.1f}%", center=True),
                    _c(_rupee(item.get("cgst_amount", 0)), right=True),
                    _c(_rupee(item.get("sgst_amount", 0)), right=True),
                    _c(_rupee(total), bold=True, right=True),
                ])

        self.items_table = Table(rows, colWidths=self.col_w, repeatRows=1, hAlign='LEFT')
        self.items_table.setStyle(self.table_style)

    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        _, items_h = self.items_table.wrap(self.width, availHeight)
        self.items_h = items_h
        
        if self.is_last_page:
            _, sum_h = self.summary_table.wrap(self.width, availHeight)
            self.sum_h = sum_h
            min_h = items_h + sum_h + 5
        else:
            self.sum_h = 0
            min_h = items_h
            
        if availHeight < min_h:
            self.height = min_h
        else:
            self.height = availHeight
        return self.width, self.height

    def draw(self):
        self.canv.saveState()
        
        # 1. Draw rounded card border and background
        self.canv.setFillColor(self.bg_color)
        self.canv.setStrokeColor(self.border_color)
        self.canv.setLineWidth(self.border_width)
        path = make_rounded_path(self.canv, 0, 0, self.width, self.height, self.radius)
        self.canv.drawPath(path, fill=1 if self.bg_color else 0, stroke=1 if self.border_color else 0)
        
        # 2. Clip children to card boundaries
        clip_path = make_rounded_path(self.canv, 0, 0, self.width, self.height, self.radius)
        self.canv.clipPath(clip_path, stroke=0, fill=0)
        
        # 3. Draw items table at the top of the box
        self.items_table.drawOn(self.canv, 0, self.height - self.items_h)
        
        # 4. Draw summary table at the bottom of the box (if last page)
        if self.is_last_page:
            self.summary_table.drawOn(self.canv, 0, 0)
            
        self.canv.restoreState()

    def split(self, availWidth, availHeight):
        fit_count = 0
        for n in range(1, len(self.items)):
            # Build temporary items table for first n items
            temp_box = UnifiedInvoiceBox(
                self.items[:n], self.summary_table, self.is_igst, self.col_w, self.col_hdrs,
                self.table_style, self.bg_color, self.border_color, self.border_width, self.radius,
                is_last_page=False, start_idx=self.start_idx
            )
            _, h = temp_box.wrap(availWidth, availHeight)
            if h <= availHeight:
                fit_count = n
            else:
                break
                
        if fit_count == 0:
            return []
            
        part1 = UnifiedInvoiceBox(
            self.items[:fit_count], self.summary_table, self.is_igst, self.col_w, self.col_hdrs,
            self.table_style, self.bg_color, self.border_color, self.border_width, self.radius,
            is_last_page=False, start_idx=self.start_idx
        )
        part2 = UnifiedInvoiceBox(
            self.items[fit_count:], self.summary_table, self.is_igst, self.col_w, self.col_hdrs,
            self.table_style, self.bg_color, self.border_color, self.border_width, self.radius,
            is_last_page=self.is_last_page, start_idx=self.start_idx + fit_count
        )
        return [part1, part2]


# ── Style builder ─────────────────────────────────────────────────────────────
def _styles():
    base = getSampleStyleSheet()

    def S(name, **kw):
        if name not in base:
            if "parent" not in kw:
                kw["parent"] = base["Normal"]
            base.add(ParagraphStyle(name, **kw))
        return name

    f, fb = _R(), _R(True)

    S("HdrTitle",   fontName=fb, fontSize=10, leading=12, textColor=NAVY,   alignment=TA_RIGHT)
    S("HdrSub",     fontName=fb, fontSize=6.5, leading=8.0, textColor=ROYAL, alignment=TA_RIGHT)
    S("HdrDate",    fontName=f,  fontSize=6,  leading=7.5, textColor=GREY, alignment=TA_RIGHT)
    S("HdrStatus",  fontName=f,  fontSize=6.5, leading=8.0, textColor=NAVY,   alignment=TA_RIGHT)
    S("HdrCoName",  fontName=fb, fontSize=9.5, leading=11.5, textColor=NAVY, alignment=TA_LEFT)
    S("HdrCoSub",   fontName=f,  fontSize=5.5, leading=7.0, textColor=GREY, alignment=TA_LEFT)
    S("HdrCoGstin", fontName=fb, fontSize=5.5, leading=7.0, textColor=GREEN_DARK, alignment=TA_LEFT)
    S("SecLabel",   fontName=fb, fontSize=6,  leading=7.5,  textColor=NAVY)
    S("SecVal",     fontName=f,  fontSize=7,  leading=9.0,  textColor=NAVY)
    S("SecValB",    fontName=fb, fontSize=7,  leading=9.0,  textColor=NAVY)
    S("TBodyN",     fontName=f,  fontSize=6.5,leading=8.0,  textColor=NAVY)
    S("TBodyR",     fontName=f,  fontSize=6.5,leading=8.0,  textColor=NAVY, alignment=TA_RIGHT)
    S("TBodyC",     fontName=f,  fontSize=6.5,leading=8.0,  textColor=NAVY, alignment=TA_CENTER)
    S("TBodyBR",    fontName=fb, fontSize=6.5,leading=8.0,  textColor=NAVY, alignment=TA_RIGHT)
    S("TBodyBC",    fontName=fb, fontSize=6.5,leading=8.0,  textColor=NAVY, alignment=TA_CENTER)
    S("ItemName",   fontName=f,  fontSize=6.5,leading=8.0,  textColor=NAVY)
    S("HSNSmall",   fontName=f,  fontSize=5.5,leading=7.0,  textColor=GREY)
    S("TotLbl",     fontName=f,  fontSize=7,  leading=9.0,  textColor=GREY,   alignment=TA_RIGHT)
    S("TotLblB",    fontName=fb, fontSize=8,  leading=10.0, textColor=NAVY,   alignment=TA_RIGHT)
    S("TotVal",     fontName=f,  fontSize=7,  leading=9.0,  textColor=NAVY,   alignment=TA_RIGHT)
    S("TotValB",    fontName=fb, fontSize=8,  leading=10.0, textColor=NAVY,   alignment=TA_RIGHT)
    S("GrandLbl",   fontName=fb, fontSize=9,  leading=11.0, textColor=GLASS_TOTAL_TX,  alignment=TA_RIGHT)
    S("GrandVal",   fontName=fb, fontSize=9,  leading=11.0, textColor=GLASS_TOTAL_TX,  alignment=TA_RIGHT)
    S("AmtWords",   fontName=fb, fontSize=7,  leading=9.0,  textColor=GREEN_DARK)
    S("FooterTerm", fontName=f,  fontSize=6,  leading=7.5,  textColor=GREY)
    S("FooterTermH",fontName=fb, fontSize=6,  leading=7.5,  textColor=ROYAL)
    S("FooterNote", fontName=f,  fontSize=5.5,leading=7.0,  textColor=SILVER, alignment=TA_CENTER)
    S("FooterThanks",fontName=fb,fontSize=7.5,leading=9.5,  textColor=NAVY,   alignment=TA_CENTER)
    S("SigLine",    fontName=f,  fontSize=6,  leading=7.5,  textColor=GREY,   alignment=TA_RIGHT)
    return base


# ── Indian number → words ─────────────────────────────────────────────────────
def _amount_words(n: float) -> str:
    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
            "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
            "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
    tens_w = ["", "", "Twenty", "Thirty", "Forty", "Fifty",
               "Sixty", "Seventy", "Eighty", "Ninety"]

    def _w(x):
        if x == 0:      return ""
        if x < 20:      return ones[x]
        if x < 100:     return tens_w[x // 10] + (f" {ones[x % 10]}" if x % 10 else "")
        if x < 1000:    return f"{ones[x // 100]} Hundred" + (f" {_w(x % 100)}" if x % 100 else "")
        if x < 100000:  return f"{_w(x // 1000)} Thousand" + (f" {_w(x % 1000)}" if x % 1000 else "")
        if x < 10000000:return f"{_w(x // 100000)} Lakh" + (f" {_w(x % 100000)}" if x % 100000 else "")
        return f"{_w(x // 10000000)} Crore" + (f" {_w(x % 10000000)}" if x % 10000000 else "")

    rupees = int(n)
    paise  = round((n - rupees) * 100)
    out    = _w(rupees) + " Rupees"
    if paise:
        out += " and " + _w(paise) + " Paise"
    return out + " Only"


# ── Main generator ────────────────────────────────────────────────────────────
async def generate_sale_invoice(sale: dict, company: dict) -> str:
    os.makedirs(settings.INVOICE_DIR, exist_ok=True)
    inv_no   = sale.get("invoice_number", "INV-0001")
    filename = f"{inv_no.replace('/', '-')}.pdf"
    filepath = os.path.join(settings.INVOICE_DIR, filename)

    pagesize_landscape = landscape(A5)
    W, H = pagesize_landscape
    LM   = 6 * mm
    RM   = 6 * mm
    CW   = W - LM - RM   # 198mm

    doc = BaseDocTemplate(
        filepath, pagesize=pagesize_landscape,
        leftMargin=LM, rightMargin=RM,
        topMargin=4 * mm, bottomMargin=24 * mm
    )

    # First page frame (takes the full height minus top and bottom margins)
    frame_first = Frame(
        LM, 24 * mm, CW, H - 24 * mm - 4 * mm,
        id="first_frame", topPadding=0, bottomPadding=0, leftPadding=0, rightPadding=0
    )
    # Later pages frame (top margin of 15mm to leave space for the compact header)
    frame_later = Frame(
        LM, 24 * mm, CW, H - 24 * mm - 15 * mm,
        id="later_frame", topPadding=0, bottomPadding=0, leftPadding=0, rightPadding=0
    )

    st    = _styles()
    story = [NextPageTemplate("LaterPages")]
    f, fb = _R(), _R(True)

    # ── Company data ─────────────────────────────────────────────────────────
    company_name = company.get("company_name", "Care Pharma")
    gstin        = company.get("gstin", "")
    address      = company.get("address", "")
    city         = company.get("city", "")
    state        = company.get("state", "")
    mobile       = company.get("mobile", "")
    email_addr   = company.get("email", "")
    drug_lic     = company.get("drug_license", "")

    sale_date = sale.get("sale_date", "")
    if isinstance(sale_date, str) and sale_date:
        try: sale_date = datetime.fromisoformat(sale_date).strftime("%d-%m-%Y")
        except: pass

    inv_time  = datetime.now().strftime("%H:%M")
    cust_name = sale.get("customer_name", "Walk-in Customer")
    cust_gstin   = sale.get("customer_gstin", "")
    cust_address = sale.get("customer_address", "")
    if isinstance(cust_address, dict):
        parts = [cust_address.get(k) for k in ["street", "city", "state", "pincode"] if cust_address.get(k)]
        cust_address = ", ".join(parts)
    cust_mobile  = sale.get("customer_mobile", "")
    pay_mode  = sale.get("payment_mode", "CASH").upper()
    is_igst   = sale.get("is_igst", False)
    status    = sale.get("status", "unpaid").upper()

    # Define callbacks for canvas drawing on page templates
    def draw_first_page(canvas, doc_obj):
        draw_page_decorations(canvas, doc_obj)

    def draw_later_page(canvas, doc_obj):
        draw_page_decorations(canvas, doc_obj)
        
        # Draw compact header on later pages
        canvas.saveState()
        
        # Left side: company name
        canvas.setFont(fb, 7.5)
        canvas.setFillColor(NAVY)
        canvas.drawString(LM, H - 10 * mm, company_name.upper())
        
        # Right side: compact invoice details
        canvas.setFont(f, 7.0)
        canvas.setFillColor(GREY)
        info_str = f"TAX INVOICE  |  Invoice No: {inv_no}  |  Date: {sale_date}  |  Page {canvas.getPageNumber()}"
        canvas.drawRightString(W - RM, H - 10 * mm, info_str)
        
        # Divider line below compact header
        canvas.setStrokeColor(GLASS_BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(LM, H - 12 * mm, W - RM, H - 12 * mm)
        
        canvas.restoreState()

    template_first = PageTemplate(id="FirstPage", frames=frame_first, onPage=draw_first_page)
    template_later = PageTemplate(id="LaterPages", frames=frame_later, onPage=draw_later_page)
    doc.addPageTemplates([template_first, template_later])

    # ══════════════════════════════════════════════════════════════════════════
    # HEADER — solid navy/royal blue banner (no overlay trick)
    # ══════════════════════════════════════════════════════════════════════════

    # Build address line
    # Build address lines (single line)
    addr_line = ", ".join([p for p in [address, city, state] if p])
    
    # Combined contact details lines
    contact_parts1 = []
    if mobile:
        contact_parts1.append(f"Ph: {mobile}")
    if email_addr:
        contact_parts1.append(email_addr)
    contact_line1 = "  |  ".join(contact_parts1)

    contact_parts2 = []
    if gstin:
        contact_parts2.append(f"<font color='#14532d'><b>GSTIN: {gstin}</b></font>")
    if drug_lic:
        contact_parts2.append(f"D.L.No.: {drug_lic}")
    contact_line2 = "  |  ".join(contact_parts2)

    logo_img = None
    logo_base64 = company.get("logo_base64")
    if logo_base64:
        try:
            import base64
            import io
            if "," in logo_base64:
                header, base64_data = logo_base64.split(",", 1)
            else:
                base64_data = logo_base64
            img_data = base64.b64decode(base64_data)
            img_file = io.BytesIO(img_data)
            logo_img = Image(img_file, width=13 * mm, height=13 * mm)
        except Exception as e:
            print(f"Failed to load user logo base64: {e}")
            
    if not logo_img:
        header_logo_path = LOGO_TRANS_PATH if os.path.exists(LOGO_TRANS_PATH) else LOGO_PATH
        if os.path.exists(header_logo_path):
            logo_img = Image(header_logo_path, width=13 * mm, height=13 * mm)

    # Sub-table of company details (Name + Address + Contacts)
    co_paragraphs = [
        Paragraph(company_name.upper(), st["HdrCoName"]),
        Paragraph(addr_line, st["HdrCoSub"])
    ]
    if contact_line1:
        co_paragraphs.append(Paragraph(contact_line1, st["HdrCoSub"]))
    if contact_line2:
        co_paragraphs.append(Paragraph(contact_line2, st["HdrCoSub"]))

    co_sub_table = Table([[p] for p in co_paragraphs], colWidths=[120 * mm])
    co_sub_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0.5),
    ]))

    if logo_img:
        logo_co_table = Table([[logo_img, co_sub_table]], colWidths=[13 * mm, 120 * mm])
        logo_co_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("LEFTPADDING", (1, 0), (1, 0), 6), # 6pt gap between logo and company info
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        left_cell = [logo_co_table]
    else:
        left_cell = [co_sub_table]

    status_color = "#16a34a" if status == "PAID" else "#d97706" if status == "PARTIAL" else "#dc2626"

    inv_table_data = [
        [Paragraph("TAX INVOICE", st["HdrTitle"])],
        [Paragraph(f"#{inv_no}", st["HdrSub"])],
        [Paragraph(sale_date, st["HdrDate"])],
        [Paragraph(f'<font color="{status_color}"><b>{status}</b></font>  <font color="#4f46e5">{pay_mode}</font>', st["HdrStatus"])]
    ]
    inv_table = Table(inv_table_data, colWidths=[60 * mm - 12], rowHeights=[13, 8, 8, 8])
    inv_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0.5),
    ]))
    inv_cell = [inv_table]

    # Combine into a single row table of height 16mm (clean 2-column layout!)
    hdr_data = [[left_cell, inv_cell]]
    hdr_table = Table(hdr_data, colWidths=[138 * mm, 60 * mm], rowHeights=[16 * mm])
    hdr_table.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"), # Vertically center-align the columns
        ("LEFTPADDING",  (0, 0), (0, 0), 5),
        ("RIGHTPADDING", (0, 0), (0, 0), 0),
        ("LEFTPADDING",  (1, 0), (1, 0), 0),
        ("RIGHTPADDING", (1, 0), (1, 0), 12),
        ("TOPPADDING",   (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
    ]))
    story.append(RoundedCard(hdr_table, bg_color=GLASS_BG, border_color=GLASS_BORDER, radius=3 * mm))
    story.append(Spacer(1, 6))

    # ══════════════════════════════════════════════════════════════════════════
    # BILL TO / INVOICE DETAILS
    # ══════════════════════════════════════════════════════════════════════════

    card_w = 97 * mm
    def label_bar(text):
        p_style = ParagraphStyle(
            f"LB_{text[:4].strip()}_inner", fontName=fb, fontSize=6.0, textColor=colors.HexColor("#4f46e5"),
            alignment=TA_LEFT
        )
        p = Paragraph(text.strip(), p_style)
        lbl_tbl = Table([[p]], colWidths=[card_w - 16])
        lbl_tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 1.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
        ]))
        return RoundedCard(
            lbl_tbl,
            bg_color=colors.Color(239/255, 246/255, 255/255, 0.6),
            border_color=colors.Color(219/255, 234/255, 255/255, 0.8),
            border_width=0.5,
            radius=1.5 * mm,
            space_after=3
        )

    bill_left = [
        label_bar("  BILL TO  "),
        Paragraph(f"<b>{cust_name}</b>", st["SecValB"]),
    ]
    if cust_address:
        bill_left.append(Paragraph(cust_address, st["SecVal"]))
    if cust_gstin:
        bill_left.append(Paragraph(f"GSTIN: {cust_gstin}", st["SecVal"]))
    if cust_mobile:
        bill_left.append(Paragraph(f"Ph: {cust_mobile}", st["SecVal"]))

    bill_right = [
        label_bar("  INVOICE DETAILS  "),
        Paragraph(f"<b>Invoice No:</b> {inv_no}", st["SecVal"]),
        Paragraph(f"<b>Date:</b> {sale_date}", st["SecVal"]),
        Paragraph(f"<b>Payment Mode:</b> {pay_mode}", st["SecVal"]),
        Paragraph(f"<b>Status:</b> {status}", st["SecVal"]),
    ]

    bill_left_table = Table([[bill_left]], colWidths=[card_w], rowHeights=[22 * mm])
    bill_left_table.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))

    bill_right_table = Table([[bill_right]], colWidths=[card_w], rowHeights=[22 * mm])
    bill_right_table.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))

    bill_container = Table([[
        RoundedCard(bill_left_table, bg_color=GLASS_BG, border_color=GLASS_BORDER, radius=2.5 * mm),
        "",
        RoundedCard(bill_right_table, bg_color=GLASS_BG, border_color=GLASS_BORDER, radius=2.5 * mm)
    ]], colWidths=[card_w, 4 * mm, card_w], hAlign='LEFT')
    bill_container.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING",   (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
    ]))
    story.append(bill_container)
    story.append(Spacer(1, 6))

    # ══════════════════════════════════════════════════════════════════════════
    # ITEMS TABLE
    # ══════════════════════════════════════════════════════════════════════════
    items = sale.get("items", [])

    if is_igst:
        # Balanced CW=198mm: 8+48+14+14+21+21+14+24+34 = 198mm
        col_hdrs = ["#", "PRODUCT NAME", "QTY", "UNIT",
                    "RATE", "TAXABLE", "IGST%", "IGST Amt", "TOTAL"]
        col_w    = [8*mm, 48*mm, 14*mm, 14*mm,
                    21*mm, 21*mm, 14*mm, 24*mm, 34*mm]
    else:
        # Balanced CW=198mm: 8+44+12+12+19+20+12+19+19+33 = 198mm
        col_hdrs = ["#", "PRODUCT NAME", "QTY", "UNIT",
                    "RATE", "TAXABLE", "GST%", "CGST", "SGST", "TOTAL"]
        col_w    = [8*mm, 44*mm, 12*mm, 12*mm,
                    19*mm, 20*mm, 12*mm, 19*mm, 19*mm, 33*mm]

    items_table_style = TableStyle([
        # Header
        ("BACKGROUND",    (0, 0), (-1, 0), GLASS_HDR_BG),
        ("TEXTCOLOR",     (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("FONTNAME",      (0, 0), (-1, 0), fb),
        ("FONTSIZE",      (0, 0), (-1, 0), 6.5),
        ("VALIGN",        (0, 0), (-1, 0), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, 0), 5),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
        ("LINEBELOW",     (0, 0), (-1, 0), 1.5, GLASS_ACCENT),
        # Header alignments matched with body content
        ("ALIGN",         (0, 0), (0, 0), "CENTER"),
        ("ALIGN",         (1, 0), (1, 0), "LEFT"),
        ("ALIGN",         (2, 0), (3, 0), "CENTER"),
        ("ALIGN",         (4, 0), (5, 0), "RIGHT"),
        ("ALIGN",         (6, 0), (6, 0), "CENTER"),
        ("ALIGN",         (7, 0), (-1, 0), "RIGHT"),
        # Body
        ("FONTNAME",      (0, 1), (-1, -1), f),
        ("FONTSIZE",      (0, 1), (-1, -1), 6.5),
        ("VALIGN",        (0, 1), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 1), (-1, -1), 3),      # Reduced padding for height optimization
        ("BOTTOMPADDING", (0, 1), (-1, -1), 3),      # Reduced padding for height optimization
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE_GLAZED, ROW_ALT_GLAZED]),
        # Paddings
        ("LEFTPADDING",   (0, 0), (-1, -1), 3),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 3),
        ("LEFTPADDING",   (0, 0), (0, -1), 8),   # extra left padding for corners
        ("RIGHTPADDING",  (-1, 0), (-1, -1), 8), # extra right padding for corners to align with summary
        # Grid
        ("LINEBELOW",     (0, 1), (-1, -1), 0.3, GLASS_BORDER),
        # Total column accent
        ("BACKGROUND",    (-1, 1), (-1, -1), TOTAL_COL_GLAZED),
    ])

    # ══════════════════════════════════════════════════════════════════════════
    # TOTALS — full-width clean table (right-aligned, no side blocks)
    # ══════════════════════════════════════════════════════════════════════════
    subtotal       = sale.get("subtotal", 0)
    disc_amount    = sale.get("discount_amount", 0)
    taxable_amt    = sale.get("taxable_amount", 0)
    total_cgst     = sale.get("total_cgst", 0)
    total_sgst     = sale.get("total_sgst", 0)
    total_igst     = sale.get("total_igst", 0)
    total_tax      = sale.get("total_tax", 0)
    total_amount   = sale.get("total_amount", 0)
    paid_amount    = sale.get("paid_amount", 0)
    balance_amount = sale.get("balance_amount", 0)

    def _tot(label, val, bold=False, grand=False, red=False):
        lbl_fn  = fb if (bold or grand) else f
        lbl_col = GLASS_TOTAL_TX if grand else (RED if red else GREY)
        val_col = GLASS_TOTAL_TX if grand else (RED if red else NAVY)
        val_fn  = fb if (bold or grand) else f
        fs      = 8.5 if grand else 7.0
        lbl_s = ParagraphStyle(f"TL_{label[:5]}", fontName=lbl_fn, fontSize=fs, leading=fs*1.2,
                               textColor=lbl_col, alignment=TA_RIGHT)
        val_s = ParagraphStyle(f"TV_{label[:5]}", fontName=val_fn, fontSize=fs, leading=fs*1.2,
                               textColor=val_col, alignment=TA_RIGHT)
        return ["", Paragraph(label, lbl_s), Paragraph(val, val_s)]

    # ── Dynamically assemble summary columns ──
    summary_cols = []
    if subtotal and subtotal != taxable_amt:
        summary_cols.append(("Sub Total", _rupee(subtotal), False, False))
    if disc_amount:
        summary_cols.append(("Discount", f"-{_rupee(disc_amount)}", False, False))
    
    # Separate Taxable Amt, CGST & SGST (or IGST), and Total Tax into individual cells
    if not is_igst:
        summary_cols.append(("Taxable Amt", _rupee(taxable_amt), False, False))
        summary_cols.append(("CGST & SGST", f"{_rupee(total_cgst)} + {_rupee(total_sgst)}", False, False))
        summary_cols.append(("Total Tax", _rupee(total_tax), False, False))
    else:
        summary_cols.append(("Taxable Amt", _rupee(taxable_amt), False, False))
        summary_cols.append(("IGST", _rupee(total_igst), False, False))
        summary_cols.append(("Total Tax", _rupee(total_tax), False, False))
        
    summary_cols.append(("Paid", _rupee(paid_amount), False, False))
    summary_cols.append(("Balance", _rupee(balance_amount), False, balance_amount > 0))
    summary_cols.append(("Grand Total", _rupee(total_amount), True, False))

    summary_cells = []
    grand_idx = -1
    for i, (label, val, is_grand, is_red) in enumerate(summary_cols):
        if is_grand:
            grand_idx = i
        
        lbl_fn = fb
        val_fn = fb if is_grand else f
        lbl_size = 5.0
        val_size = 7.0 if is_grand else 6.0
        
        lbl_color = "#4f46e5" if is_grand else "#64748b"
        val_color = "#312e81" if is_grand else ("#dc2626" if is_red else "#0d1b3e")
        
        display_label = label.replace('&', '&amp;')
        cell_html = (
            f'<font face="{lbl_fn}" size="{lbl_size}" color="{lbl_color}">{display_label.upper()}</font><br/>'
            f'<font face="{val_fn}" size="{val_size}" color="{val_color}"><b>{val}</b></font>'
        )
        
        style_name = f"Col_{label.replace(' ', '_').replace('&', 'and').replace('+', 'plus')}_{i}"
        p = Paragraph(cell_html, ParagraphStyle(
            style_name,
            alignment=TA_CENTER,
            leading=val_size * 1.15
        ))
        if is_grand:
            summary_cells.append(GrandTotalCell(p, bg_color=colors.Color(224/255, 231/255, 255/255, 0.9), border_color=colors.HexColor("#6366f1"), radius=1.5 * mm))
        else:
            summary_cells.append(p)

    # Dynamic Column Width Distribution based on Base Widths
    # Total available width CW = 198mm
    base_widths = {
        "Sub Total": 20 * mm,
        "Discount": 20 * mm,
        "Taxable Amt": 28 * mm,
        "CGST & SGST": 38 * mm,
        "IGST": 28 * mm,
        "Total Tax": 24 * mm,
        "Paid": 24 * mm,
        "Balance": 24 * mm,
        "Grand Total": 32 * mm,
    }
    
    active_labels = [col[0] for col in summary_cols]
    sum_base = sum(base_widths.get(lbl, 24 * mm) for lbl in active_labels)
    scale = CW / sum_base
    
    col_widths = [base_widths.get(lbl, 24 * mm) * scale for lbl in active_labels]
    num_cols = len(summary_cols)

    t_style = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 1),
        ("RIGHTPADDING", (0, 0), (-1, -1), 1),
    ]

    # Add subtle vertical dividers between cells and handle corner padding
    t_style.append(("LEFTPADDING", (0, 0), (0, -1), 8))  # extra left padding for corner
    for i in range(num_cols - 1):
        if grand_idx != -1 and (i == grand_idx - 1 or i == grand_idx):
            continue
        t_style.append(("LINEAFTER", (i, 0), (i, -1), 0.5, colors.HexColor("#cbd5e1")))

    if grand_idx != -1:
        # Keep consistent padding with the rest of the layout (8pt right padding to align with items table)
        t_style.append(("TOPPADDING", (grand_idx, 0), (grand_idx, -1), 2))
        t_style.append(("BOTTOMPADDING", (grand_idx, 0), (grand_idx, -1), 2))
        t_style.append(("LEFTPADDING", (grand_idx, 0), (grand_idx, -1), 4))
        t_style.append(("RIGHTPADDING", (grand_idx, 0), (grand_idx, -1), 8))

    # Divider line above all summary cells spanning the full width
    t_style.append(("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.HexColor("#cbd5e1")))

    summary_table = Table([summary_cells], colWidths=col_widths, hAlign='LEFT')
    summary_table.setStyle(TableStyle(t_style))

    # Split items into chunks of max 10 products per page
    chunks = [items[i:i + 10] for i in range(0, len(items), 10)] if items else [[]]
    for idx, chunk in enumerate(chunks):
        is_last = (idx == len(chunks) - 1)
        box = UnifiedInvoiceBox(
            items=chunk,
            summary_table=summary_table,
            is_igst=is_igst,
            col_w=col_w,
            col_hdrs=col_hdrs,
            table_style=items_table_style,
            bg_color=GLASS_BG,
            border_color=GLASS_BORDER,
            border_width=0.5,
            radius=3 * mm,
            is_last_page=is_last,
            start_idx=idx * 10 + 1
        )
        story.append(box)
        if not is_last:
            story.append(PageBreak())

    # ── Define canvas layout callback to center watermark and fix footer at absolute bottom ──
    def draw_page_decorations(canvas, doc_obj):
        # 1. Centered Watermark Logo Crest
        watermark_img = None
        watermark_base64 = company.get("watermark_base64")
        if watermark_base64:
            try:
                import base64
                import io
                from reportlab.lib.utils import ImageReader
                if "," in watermark_base64:
                    header, base64_data = watermark_base64.split(",", 1)
                else:
                    base64_data = watermark_base64
                img_data = base64.b64decode(base64_data)
                img_file = io.BytesIO(img_data)
                watermark_img = ImageReader(img_file)
            except Exception as e:
                print(f"Failed to load watermark base64: {e}")
                
        if not watermark_img:
            default_path = CREST_PATH if os.path.exists(CREST_PATH) else LOGO_PATH
            if os.path.exists(default_path):
                from reportlab.lib.utils import ImageReader
                watermark_img = ImageReader(default_path)
                
        if watermark_img:
            canvas.saveState()
            canvas.setFillAlpha(0.20)
            canvas.setStrokeAlpha(0.20)
            w_width, w_height = 55 * mm, 55 * mm
            x = (W - w_width) / 2
            y = (H - w_height) / 2  # Exactly in the middle
            canvas.drawImage(watermark_img, x, y, width=w_width, height=w_height, mask='auto')
            canvas.restoreState()

        # 2. Fixed Bottom Footer
        canvas.saveState()
        
        # Divider line at y = 20 * mm
        canvas.setStrokeColor(GLASS_BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(LM, 20 * mm, W - RM, 20 * mm)
        
        # Footer text in center (y = 10 * mm)
        footer_text = company.get("invoice_footer") or "Thank you for your business!"
        ft_style = ParagraphStyle(
            "FT3_canvas", fontName=fb, fontSize=7.5, textColor=NAVY, alignment=TA_CENTER
        )
        ft_p = Paragraph(footer_text, ft_style)
        ft_p.wrap(70 * mm, 12)
        ft_p.drawOn(canvas, (W - 70 * mm) / 2, 10 * mm)
        
        # Plain text Authorized Signatory on the right (old style, no button box, no line)
        sig_p = Paragraph(
            f'<font face="{f}" size="7.0" color="#475569">Authorised Signatory</font><br/>'
            f'<font face="{fb}" size="7.0" color="#1e293b">{company_name}</font>',
            ParagraphStyle("SigText_canvas", alignment=TA_RIGHT, leading=9.5)
        )
        sig_p.wrap(60 * mm, 15 * mm)
        sig_p.drawOn(canvas, W - RM - 60 * mm, 4.0 * mm)

        # Decode and draw signature image if available
        sig_b64 = company.get("signature_base64", "")
        if sig_b64:
            try:
                import base64
                import io
                from reportlab.lib.utils import ImageReader
                b64_data = sig_b64.split(",")[-1] if "," in sig_b64 else sig_b64
                img_bytes = base64.b64decode(b64_data)
                img_bytes = make_white_transparent(img_bytes)
                sig_img_reader = ImageReader(io.BytesIO(img_bytes))
                
                sig_w = 32 * mm
                sig_h = 9 * mm
                sig_x = W - RM - sig_w
                sig_y = 10 * mm  # Sits beautifully above the text and below the line
                canvas.drawImage(
                    sig_img_reader, sig_x, sig_y,
                    width=sig_w, height=sig_h,
                    mask='auto', preserveAspectRatio=True,
                )
            except Exception as e:
                print(f"Failed to draw signature in invoice PDF: {e}")
        
        # Bottom gradient bar at y = 1.0 * mm (absolute bottom area)
        grad = GradientRect(CW, 2.0, GLASS_ACCENT, TEAL)
        grad.wrap(CW, 2.0)
        grad.drawOn(canvas, LM, 1.0 * mm)
        
        # Parse invoice generation time from sale_date
        sale_date_val = sale.get("sale_date") or sale.get("created_at") or sale.get("date")
        invoice_time = None
        if sale_date_val:
            try:
                if isinstance(sale_date_val, str):
                    invoice_time = datetime.fromisoformat(sale_date_val.replace("Z", ""))
                elif isinstance(sale_date_val, datetime):
                    invoice_time = sale_date_val
            except Exception:
                pass
        if not invoice_time:
            invoice_time = datetime.now()

        # Computer generated timestamp at y = 5.0 * mm (sits above the gradient bar)
        cg_p = Paragraph(
            f"Computer generated invoice | {invoice_time.strftime('%d-%m-%Y %H:%M')}",
            ParagraphStyle("GN_canvas", fontName=f, fontSize=5.5, textColor=SILVER, alignment=TA_CENTER)
        )
        cg_p.wrap(CW, 8)
        cg_p.drawOn(canvas, LM, 5.0 * mm)
        
        canvas.restoreState()

    doc.build(story)
    return filepath


# ── Credit & Debit Note PDF Generator ──────────────────────────────────────────
async def generate_return_note(ret: dict, company: dict) -> str:
    os.makedirs(settings.INVOICE_DIR, exist_ok=True)
    note_no  = ret.get("note_number", "CN-0001")
    filename = f"{note_no.replace('/', '-')}.pdf"
    filepath = os.path.join(settings.INVOICE_DIR, filename)

    pagesize_landscape = landscape(A5)
    W, H = pagesize_landscape
    LM   = 6 * mm
    RM   = 6 * mm
    CW   = W - LM - RM   # 198mm

    doc = BaseDocTemplate(
        filepath, pagesize=pagesize_landscape,
        leftMargin=LM, rightMargin=RM,
        topMargin=4 * mm, bottomMargin=24 * mm
    )

    frame_first = Frame(
        LM, 24 * mm, CW, H - 24 * mm - 4 * mm,
        id="first_frame", topPadding=0, bottomPadding=0, leftPadding=0, rightPadding=0
    )
    frame_later = Frame(
        LM, 24 * mm, CW, H - 24 * mm - 15 * mm,
        id="later_frame", topPadding=0, bottomPadding=0, leftPadding=0, rightPadding=0
    )

    st    = _styles()
    story = [NextPageTemplate("LaterPages")]
    f, fb = _R(), _R(True)

    company_name = company.get("company_name", "Care Pharma")
    gstin        = company.get("gstin", "")
    address      = company.get("address", "")
    city         = company.get("city", "")
    state        = company.get("state", "")
    mobile       = company.get("mobile", "")
    email_addr   = company.get("email", "")
    drug_lic     = company.get("drug_license", "")

    note_date = ret.get("date", "")
    if isinstance(note_date, str) and note_date:
        try:
            note_date = datetime.fromisoformat(note_date.replace("Z", "")).strftime("%d-%m-%Y")
        except:
            pass
    elif isinstance(note_date, datetime):
        note_date = note_date.strftime("%d-%m-%Y")

    party_name = ret.get("party_name", "Walk-in Customer")
    party_gstin   = ret.get("party_gstin", "")
    party_address = ret.get("party_address", "")
    if isinstance(party_address, dict):
        parts = [party_address.get(k) for k in ["street", "city", "state", "pincode"] if party_address.get(k)]
        party_address = ", ".join(parts)
    party_mobile  = ret.get("party_mobile", "")
    is_igst   = ret.get("is_igst", False)

    note_type_label = "CREDIT NOTE" if ret.get("type") == "customer" else "DEBIT NOTE"

    def draw_first_page(canvas, doc_obj):
        draw_page_decorations(canvas, doc_obj)

    def draw_later_page(canvas, doc_obj):
        draw_page_decorations(canvas, doc_obj)
        canvas.saveState()
        canvas.setFont(fb, 7.5)
        canvas.setFillColor(NAVY)
        canvas.drawString(LM, H - 10 * mm, company_name.upper())
        canvas.setFont(f, 7.0)
        canvas.setFillColor(GREY)
        info_str = f"{note_type_label}  |  Note No: {note_no}  |  Date: {note_date}  |  Page {canvas.getPageNumber()}"
        canvas.drawRightString(W - RM, H - 10 * mm, info_str)
        canvas.setStrokeColor(GLASS_BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(LM, H - 12 * mm, W - RM, H - 12 * mm)
        canvas.restoreState()

    template_first = PageTemplate(id="FirstPage", frames=frame_first, onPage=draw_first_page)
    template_later = PageTemplate(id="LaterPages", frames=frame_later, onPage=draw_later_page)
    doc.addPageTemplates([template_first, template_later])

    addr_line = ", ".join([p for p in [address, city, state] if p])
    contact_parts1 = [f"Ph: {mobile}"] if mobile else []
    if email_addr:
        contact_parts1.append(email_addr)
    contact_line1 = "  |  ".join(contact_parts1)

    contact_parts2 = [f"<font color='#14532d'><b>GSTIN: {gstin}</b></font>"] if gstin else []
    if drug_lic:
        contact_parts2.append(f"D.L.No.: {drug_lic}")
    contact_line2 = "  |  ".join(contact_parts2)

    logo_img = None
    header_logo_path = LOGO_TRANS_PATH if os.path.exists(LOGO_TRANS_PATH) else LOGO_PATH
    if os.path.exists(header_logo_path):
        logo_img = Image(header_logo_path, width=13 * mm, height=13 * mm)

    co_paragraphs = [
        Paragraph(company_name.upper(), st["HdrCoName"]),
        Paragraph(addr_line, st["HdrCoSub"])
    ]
    if contact_line1:
        co_paragraphs.append(Paragraph(contact_line1, st["HdrCoSub"]))
    if contact_line2:
        co_paragraphs.append(Paragraph(contact_line2, st["HdrCoSub"]))

    co_sub_table = Table([[p] for p in co_paragraphs], colWidths=[120 * mm])
    co_sub_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0.5),
    ]))

    if logo_img:
        logo_co_table = Table([[logo_img, co_sub_table]], colWidths=[13 * mm, 120 * mm])
        logo_co_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("LEFTPADDING", (1, 0), (1, 0), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        left_cell = [logo_co_table]
    else:
        left_cell = [co_sub_table]

    inv_table_data = [
        [Paragraph(note_type_label, st["HdrTitle"])],
        [Paragraph(f"#{note_no}", st["HdrSub"])],
        [Paragraph(note_date, st["HdrDate"])],
        [Paragraph(f"Original Ref: {ret.get('reference_id') or 'N/A'}", st["HdrStatus"])]
    ]
    inv_table = Table(inv_table_data, colWidths=[60 * mm - 12], rowHeights=[13, 8, 8, 8])
    inv_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0.5),
    ]))
    inv_cell = [inv_table]

    header_table = Table([[left_cell, inv_cell]], colWidths=[138 * mm, 60 * mm])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    hdr_container = Table([[header_table]], colWidths=[CW])
    hdr_container.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.Color(248/255, 250/255, 252/255, 0.55)),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, GLASS_BORDER),
    ]))
    story.append(hdr_container)
    story.append(Spacer(1, 4))

    party_label = "BILL TO CUSTOMER" if ret.get("type") == "customer" else "RETURNED TO SUPPLIER"
    party_details_html = (
        f'<font face="{fb}" size="6.0" color="#4f46e5">{party_label}</font><br/>'
        f'<font face="{fb}" size="8.5" color="#0f172a"><b>{party_name}</b></font>'
    )
    if party_address:
        party_details_html += f'<br/><font face="{f}" size="7.0" color="#334155">{party_address}</font>'
    if party_mobile:
        party_details_html += f'<br/><font face="{f}" size="7.0" color="#334155">Ph: {party_mobile}</font>'
    if party_gstin:
        party_details_html += f'<br/><font face="{f}" size="7.0" color="#1e293b"><b>GSTIN: {party_gstin}</b></font>'

    p_left = Paragraph(party_details_html, ParagraphStyle("PartyD", leading=9.0))
    p_right = Paragraph(
        f'<font face="{fb}" size="6.0" color="#64748b">NOTE TOTAL</font><br/>'
        f'<font face="{fb}" size="11.0" color="#0f172a"><b>{_rupee(ret.get("total_amount", 0.0))}</b></font><br/>'
        f'<font face="{f}" size="6.5" color="#dc2626"><b>Pending Adj: {_rupee(ret.get("balance_amount", 0.0))}</b></font>',
        ParagraphStyle("TotalBrief", alignment=TA_RIGHT, leading=10.0)
    )

    bill_table = Table([[p_left, p_right]], colWidths=[130 * mm, 68 * mm])
    bill_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))

    bill_container = Table([[bill_table]], colWidths=[CW])
    bill_container.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.Color(248/255, 250/255, 252/255, 0.4)),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(bill_container)
    story.append(Spacer(1, 4))

    ret_items = ret.get("items", [])
    mapped_items = []
    for item in ret_items:
        copy_item = dict(item)
        copy_item["product_name"] = f"{item.get('product_name')} ({item.get('reason', 'N/A')})"
        mapped_items.append(copy_item)

    if is_igst:
        col_hdrs = ["#", "PRODUCT NAME (REASON)", "QTY", "UNIT", "RATE", "TAXABLE", "IGST%", "IGST Amt", "TOTAL"]
        col_w    = [8*mm, 48*mm, 14*mm, 14*mm, 21*mm, 21*mm, 14*mm, 24*mm, 34*mm]
    else:
        col_hdrs = ["#", "PRODUCT NAME (REASON)", "QTY", "UNIT", "RATE", "TAXABLE", "GST%", "CGST", "SGST", "TOTAL"]
        col_w    = [8*mm, 44*mm, 12*mm, 12*mm, 19*mm, 20*mm, 12*mm, 19*mm, 19*mm, 33*mm]

    items_table_style = TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), GLASS_HDR_BG),
        ("TEXTCOLOR",     (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("FONTNAME",      (0, 0), (-1, 0), fb),
        ("FONTSIZE",      (0, 0), (-1, 0), 6.5),
        ("VALIGN",        (0, 0), (-1, 0), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, 0), 5),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
        ("LINEBELOW",     (0, 0), (-1, 0), 1.5, GLASS_ACCENT),
        ("ALIGN",         (0, 0), (0, 0), "CENTER"),
        ("ALIGN",         (1, 0), (1, 0), "LEFT"),
        ("ALIGN",         (2, 0), (3, 0), "CENTER"),
        ("ALIGN",         (4, 0), (5, 0), "RIGHT"),
        ("ALIGN",         (6, 0), (6, 0), "CENTER"),
        ("ALIGN",         (7, 0), (-1, 0), "RIGHT"),
        ("FONTNAME",      (0, 1), (-1, -1), f),
        ("FONTSIZE",      (0, 1), (-1, -1), 6.5),
        ("VALIGN",        (0, 1), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 1), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 3),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE_GLAZED, ROW_ALT_GLAZED]),
        ("LEFTPADDING",   (0, 0), (-1, -1), 3),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 3),
        ("LEFTPADDING",   (0, 0), (0, -1), 8),
        ("RIGHTPADDING",  (-1, 0), (-1, -1), 8),
        ("LINEBELOW",     (0, 1), (-1, -1), 0.3, GLASS_BORDER),
        ("BACKGROUND",    (-1, 1), (-1, -1), TOTAL_COL_GLAZED),
    ])

    subtotal       = ret.get("subtotal", 0)
    taxable_amt    = ret.get("taxable_amount", subtotal)
    total_cgst     = ret.get("total_cgst", 0)
    total_sgst     = ret.get("total_sgst", 0)
    total_igst     = ret.get("total_igst", 0)
    total_tax      = ret.get("total_tax", 0)
    total_amount   = ret.get("total_amount", 0)
    paid_amount    = ret.get("paid_amount", 0)
    balance_amount = ret.get("balance_amount", 0)

    summary_cols = []
    summary_cols.append(("Taxable Amt", _rupee(taxable_amt), False, False))
    if not is_igst:
        summary_cols.append(("CGST & SGST", f"{_rupee(total_cgst)} + {_rupee(total_sgst)}", False, False))
    else:
        summary_cols.append(("IGST", _rupee(total_igst), False, False))
    summary_cols.append(("Total Tax", _rupee(total_tax), False, False))
    summary_cols.append(("Paid/Refunded", _rupee(paid_amount), False, False))
    summary_cols.append(("Balance Adj", _rupee(balance_amount), False, False))
    summary_cols.append(("Grand Total", _rupee(total_amount), True, False))

    summary_cells = []
    for i, (label, val, is_grand, is_red) in enumerate(summary_cols):
        lbl_fn = fb
        val_fn = fb if is_grand else f
        lbl_size = 5.0
        val_size = 7.0 if is_grand else 6.0
        lbl_color = "#4f46e5" if is_grand else "#64748b"
        val_color = "#312e81" if is_grand else ("#dc2626" if is_red else "#0d1b3e")
        display_label = label.replace('&', '&amp;')
        cell_html = (
            f'<font face="{lbl_fn}" size="{lbl_size}" color="{lbl_color}">{display_label.upper()}</font><br/>'
            f'<font face="{val_fn}" size="{val_size}" color="{val_color}"><b>{val}</b></font>'
        )
        style_name = f"RetCol_{label.replace(' ', '_')}_{i}"
        p = Paragraph(cell_html, ParagraphStyle(style_name, alignment=TA_CENTER, leading=val_size * 1.15))
        if is_grand:
            summary_cells.append(GrandTotalCell(p, bg_color=colors.Color(224/255, 231/255, 255/255, 0.9), border_color=colors.HexColor("#6366f1"), radius=1.5 * mm))
        else:
            summary_cells.append(p)

    base_widths = {
        "Taxable Amt": 28 * mm,
        "CGST & SGST": 38 * mm,
        "IGST": 28 * mm,
        "Total Tax": 24 * mm,
        "Paid/Refunded": 28 * mm,
        "Balance Adj": 28 * mm,
        "Grand Total": 32 * mm,
    }
    active_labels = [col[0] for col in summary_cols]
    sum_base = sum(base_widths.get(lbl, 24 * mm) for lbl in active_labels)
    scale = CW / sum_base
    col_widths = [base_widths.get(lbl, 24 * mm) * scale for lbl in active_labels]

    summary_table = Table([summary_cells], colWidths=col_widths)
    summary_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    chunks = [mapped_items[i:i + 10] for i in range(0, len(mapped_items), 10)] if mapped_items else [[]]
    for idx, chunk in enumerate(chunks):
        is_last = (idx == len(chunks) - 1)
        box = UnifiedInvoiceBox(
            items=chunk,
            summary_table=summary_table,
            is_igst=is_igst,
            col_w=col_w,
            col_hdrs=col_hdrs,
            table_style=items_table_style,
            bg_color=GLASS_BG,
            border_color=GLASS_BORDER,
            border_width=0.5,
            radius=3 * mm,
            is_last_page=is_last,
            start_idx=idx * 10 + 1
        )
        story.append(box)
        if not is_last:
            story.append(PageBreak())

    def draw_page_decorations(canvas, doc_obj):
        default_path = CREST_PATH if os.path.exists(CREST_PATH) else LOGO_PATH
        if os.path.exists(default_path):
            from reportlab.lib.utils import ImageReader
            watermark_img = ImageReader(default_path)
            canvas.saveState()
            canvas.setFillAlpha(0.12)
            canvas.setStrokeAlpha(0.12)
            w_width, w_height = 55 * mm, 55 * mm
            x = (W - w_width) / 2
            y = (H - w_height) / 2
            canvas.drawImage(watermark_img, x, y, width=w_width, height=w_height, mask='auto')
            canvas.restoreState()

        canvas.saveState()
        canvas.setStrokeColor(GLASS_BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(LM, 20 * mm, W - RM, 20 * mm)

        footer_text = company.get("invoice_footer") or "Thank you for your business!"
        ft_style = ParagraphStyle("FT3_canvas_ret", fontName=fb, fontSize=7.5, textColor=NAVY, alignment=TA_CENTER)
        ft_p = Paragraph(footer_text, ft_style)
        ft_p.wrap(70 * mm, 12)
        ft_p.drawOn(canvas, (W - 70 * mm) / 2, 10 * mm)

        sig_p = Paragraph(
            f'<font face="{f}" size="7.0" color="#475569">Authorised Signatory</font><br/>'
            f'<font face="{fb}" size="7.0" color="#1e293b">{company_name}</font>',
            ParagraphStyle("SigText_canvas_ret", alignment=TA_RIGHT, leading=9.5)
        )
        sig_p.wrap(60 * mm, 15 * mm)
        sig_p.drawOn(canvas, W - RM - 60 * mm, 4.0 * mm)

        # Decode and draw signature image if available
        sig_b64 = company.get("signature_base64", "")
        if sig_b64:
            try:
                import base64
                import io
                from reportlab.lib.utils import ImageReader
                b64_data = sig_b64.split(",")[-1] if "," in sig_b64 else sig_b64
                img_bytes = base64.b64decode(b64_data)
                img_bytes = make_white_transparent(img_bytes)
                sig_img_reader = ImageReader(io.BytesIO(img_bytes))
                
                sig_w = 32 * mm
                sig_h = 9 * mm
                sig_x = W - RM - sig_w
                sig_y = 10 * mm  # Sits beautifully above the text and below the line
                canvas.drawImage(
                    sig_img_reader, sig_x, sig_y,
                    width=sig_w, height=sig_h,
                    mask='auto', preserveAspectRatio=True,
                )
            except Exception as e:
                print(f"Failed to draw signature in credit/debit note PDF: {e}")

        grad = GradientRect(CW, 2.0, GLASS_ACCENT, TEAL)
        grad.wrap(CW, 2.0)
        grad.drawOn(canvas, LM, 1.0 * mm)

        # Parse return note generation time from ret object
        ret_date_val = ret.get("created_at") or ret.get("date")
        return_time = None
        if ret_date_val:
            try:
                if isinstance(ret_date_val, str):
                    return_time = datetime.fromisoformat(ret_date_val.replace("Z", ""))
                elif isinstance(ret_date_val, datetime):
                    return_time = ret_date_val
            except Exception:
                pass
        if not return_time:
            return_time = datetime.now()

        cg_p = Paragraph(
            f"Computer generated return document | {return_time.strftime('%d-%m-%Y %H:%M')}",
            ParagraphStyle("GN_canvas_ret", fontName=f, fontSize=5.5, textColor=SILVER, alignment=TA_CENTER)
        )
        cg_p.wrap(CW, 8)
        cg_p.drawOn(canvas, LM, 5.0 * mm)
        canvas.restoreState()

    doc.build(story)
    return filepath


# ══════════════════════════════════════════════════════════════════════════════
# COMPANY LETTERHEAD PDF GENERATOR
# ══════════════════════════════════════════════════════════════════════════════

import html
import re
import base64
import io
import asyncio
from reportlab.lib.pagesizes import A4

_LETTERHEAD_DIR = os.path.abspath(settings.DOCS_DIR)


def _parse_html_to_story(content: str, f: str, fb: str, page_width: float, font_size: int = 10) -> list:
    """
    Convert basic HTML rich text → ReportLab Paragraph / Table flowables.
    Handles: <p>, <b>, <strong>, <i>, <em>, <u>, <ul>, <ol>, <li>, <table>, <tr>, <td>, <th>, <br>.
    """
    from reportlab.platypus import ListFlowable, ListItem

    story_items = []
    body_style = ParagraphStyle(
        "LH_Body", fontName=f, fontSize=font_size, leading=int(font_size * 1.5), textColor=NAVY,
        spaceBefore=4, spaceAfter=4,
    )
    bold_style = ParagraphStyle(
        "LH_Bold", fontName=fb, fontSize=font_size, leading=int(font_size * 1.5), textColor=NAVY,
        spaceBefore=4, spaceAfter=4,
    )

    # Convert <span style="font-size: XXpt"> to <font size="XX"> to preserve individual sizes
    span_fs_pattern = re.compile(r'<span[^>]*style=["\'][^"\']*font-size:\s*(\d+)(?:pt|px|em)?[^"\']*["\'][^>]*>(.*?)</span>', re.DOTALL | re.IGNORECASE)
    old_content = ""
    while old_content != content:
        old_content = content
        content = span_fs_pattern.sub(r'<font size="\1">\2</font>', content)

    # Clean up content — normalize tags
    content = re.sub(r'<br\s*/?>', '\n', content)
    content = re.sub(r'<p[^>]*>', '', content)
    content = re.sub(r'</p>', '\n', content)
    content = re.sub(r'<(div|span)[^>]*>', '', content)
    content = re.sub(r'</(div|span)>', '', content)

    # Extract and replace tables first
    table_pattern = re.compile(r'<table[^>]*>(.*?)</table>', re.DOTALL | re.IGNORECASE)
    ul_pattern = re.compile(r'<ul[^>]*>(.*?)</ul>', re.DOTALL | re.IGNORECASE)
    ol_pattern = re.compile(r'<ol[^>]*>(.*?)</ol>', re.DOTALL | re.IGNORECASE)
    li_pattern = re.compile(r'<li[^>]*>(.*?)</li>', re.DOTALL | re.IGNORECASE)
    tr_pattern = re.compile(r'<tr[^>]*>(.*?)</tr>', re.DOTALL | re.IGNORECASE)
    td_pattern = re.compile(r'<t[dh][^>]*>(.*?)</t[dh]>', re.DOTALL | re.IGNORECASE)

    # Split content on table boundaries
    parts = re.split(r'(<table[^>]*>.*?</table>|<ul[^>]*>.*?</ul>|<ol[^>]*>.*?</ol>)',
                     content, flags=re.DOTALL | re.IGNORECASE)

    for part in parts:
        part_stripped = part.strip()
        if not part_stripped:
            continue

        # Handle tables
        if re.match(r'<table', part_stripped, re.IGNORECASE):
            rows_data = []
            for row_match in tr_pattern.finditer(part_stripped):
                row_html = row_match.group(1)
                cells = [re.sub(r'<[^>]+>', '', td_match.group(1)).strip()
                         for td_match in td_pattern.finditer(row_html)]
                if cells:
                    rows_data.append(cells)

            if rows_data:
                # Normalize row widths
                max_cols = max(len(r) for r in rows_data)
                for row in rows_data:
                    while len(row) < max_cols:
                        row.append("")

                col_w = [(page_width - 20) / max_cols] * max_cols
                tbl_data = [
                    [Paragraph(cell, body_style) for cell in row]
                    for row in rows_data
                ]
                tbl = Table(tbl_data, colWidths=col_w)
                tbl_style = TableStyle([
                    ('GRID', (0, 0), (-1, -1), 0.5, GLASS_BORDER),
                    ('BACKGROUND', (0, 0), (-1, 0), LIGHT_BG),
                    ('FONTNAME', (0, 0), (-1, 0), fb),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                    ('LEFTPADDING', (0, 0), (-1, -1), 6),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ])
                tbl.setStyle(tbl_style)
                story_items.append(tbl)
                story_items.append(Spacer(1, 3 * mm))
            continue

        # Handle unordered lists
        if re.match(r'<ul', part_stripped, re.IGNORECASE):
            items = li_pattern.findall(part_stripped)
            bullet_items = []
            for item_text in items:
                clean = re.sub(r'<[^>]+>', '', item_text).strip()
                bullet_items.append(
                    ListItem(Paragraph(clean, body_style), bulletColor=GLASS_ACCENT, leftIndent=15)
                )
            if bullet_items:
                story_items.append(ListFlowable(bullet_items, bulletType='bullet',
                                                leftIndent=10, spaceBefore=4, spaceAfter=4))
            continue

        # Handle ordered lists
        if re.match(r'<ol', part_stripped, re.IGNORECASE):
            items = li_pattern.findall(part_stripped)
            num_items = []
            for item_text in items:
                clean = re.sub(r'<[^>]+>', '', item_text).strip()
                num_items.append(
                    ListItem(Paragraph(clean, body_style), leftIndent=15)
                )
            if num_items:
                story_items.append(ListFlowable(num_items, bulletType='1',
                                                leftIndent=10, spaceBefore=4, spaceAfter=4))
            continue

        # Plain paragraphs / inline text — preserve inline bold/italic tags for Paragraph
        # Split on newlines to create paragraph breaks
        lines = [l for l in part_stripped.split('\n') if l.strip()]
        for line in lines:
            # Convert HTML tags to ReportLab XML equivalents
            line_clean = (line
                .replace('<strong>', '<b>').replace('</strong>', '</b>')
                .replace('<em>', '<i>').replace('</em>', '</i>')
                .replace('<s>', '<strike>').replace('</s>', '</strike>')
                .replace('<del>', '<strike>').replace('</del>', '</strike>')
            )
            # Strip remaining unrecognized tags but keep <b> <i> <u> and <font>
            line_clean = re.sub(r'<(?!/?[biuBIU]|/?strike|/?br|/?font)[^>]+>', '', line_clean)
            line_clean = line_clean.strip()
            if line_clean:
                story_items.append(Paragraph(line_clean, body_style))

    return story_items


def make_white_transparent(img_bytes: bytes) -> bytes:
    """
    Remove white/light background from an image using Pillow.
    Uses a grayscale inversion mask to create a clean, anti-aliased transparency channel.
    """
    try:
        from PIL import Image, ImageOps
        img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
        r, g, b, a = img.split()
        
        # Convert to grayscale and invert so white becomes transparent, black becomes opaque
        gray = img.convert("L")
        alpha = ImageOps.invert(gray)
        
        # Blend with original alpha mask if it exists
        if a:
            alpha = Image.min(alpha, a)
            
        transparent_img = Image.merge("RGBA", (r, g, b, alpha))
        
        buf = io.BytesIO()
        transparent_img.save(buf, format="PNG")
        return buf.getvalue()
    except Exception:
        return img_bytes


async def generate_letterhead_pdf(doc_data: dict, settings_data: dict) -> str:
    """
    Generate a professional A4 company letterhead PDF.
    Shares brand palette and font registration from invoice generator.
    """
    os.makedirs(_LETTERHEAD_DIR, exist_ok=True)
    ref = doc_data.get("reference", "LETTER")
    filepath = os.path.join(_LETTERHEAD_DIR, f"Letter-{ref}.pdf")

    _register_fonts()
    f, fb = _R(), _R(True)

    # ── Page dimensions ────────────────────────────────────────────────────────
    W, H = A4
    margin_top    = float(doc_data.get("margin_top", 25)) * mm
    margin_right  = float(doc_data.get("margin_right", 20)) * mm
    margin_bottom = float(doc_data.get("margin_bottom", 25)) * mm
    margin_left   = float(doc_data.get("margin_left", 20)) * mm
    CW = W - margin_left - margin_right

    # ── Company info ───────────────────────────────────────────────────────────
    company_name  = settings_data.get("company_name", "Company Name")
    gstin         = settings_data.get("gstin", "")
    drug_license  = settings_data.get("drug_license", "")
    address       = settings_data.get("address", "")
    city          = settings_data.get("city", "")
    state         = settings_data.get("state", "")
    pincode       = settings_data.get("pincode", "")
    mobile        = settings_data.get("mobile", "")
    email         = settings_data.get("email", "")
    website       = settings_data.get("website", "")
    logo_b64      = settings_data.get("logo_base64", "")
    wm_b64        = settings_data.get("watermark_base64", "") or logo_b64
    sig_b64       = settings_data.get("signature_base64", "")
    show_wm       = doc_data.get("show_watermark", True) and settings_data.get("watermark_enabled", True)
    show_header   = doc_data.get("show_header", True)
    show_footer   = doc_data.get("show_footer", True)
    show_sig      = doc_data.get("show_signature", True)
    show_pages    = doc_data.get("show_page_numbers", True)
    is_confidential = doc_data.get("is_confidential", False)
    footer_notes  = doc_data.get("footer_notes", "")

    # Decode watermark image if available
    wm_img_reader = None
    if show_wm and wm_b64:
        try:
            from reportlab.lib.utils import ImageReader
            b64_data = wm_b64.split(",")[-1] if "," in wm_b64 else wm_b64
            img_bytes = base64.b64decode(b64_data)
            img_bytes = make_white_transparent(img_bytes)
            wm_img_reader = ImageReader(io.BytesIO(img_bytes))
        except Exception:
            wm_img_reader = None

    # Decode logo image if available
    logo_img_reader = None
    if logo_b64:
        try:
            from reportlab.lib.utils import ImageReader
            b64_data = logo_b64.split(",")[-1] if "," in logo_b64 else logo_b64
            img_bytes = base64.b64decode(b64_data)
            logo_img_reader = ImageReader(io.BytesIO(img_bytes))
        except Exception:
            logo_img_reader = None

    # Decode signature image if available
    sig_img_reader = None
    if show_sig and sig_b64:
        try:
            from reportlab.lib.utils import ImageReader
            b64_data = sig_b64.split(",")[-1] if "," in sig_b64 else sig_b64
            img_bytes = base64.b64decode(b64_data)
            img_bytes = make_white_transparent(img_bytes)
            sig_img_reader = ImageReader(io.BytesIO(img_bytes))
        except Exception:
            sig_img_reader = None

    # ── QR Code (company website) ──────────────────────────────────────────────
    qr_img_reader = None
    if show_footer and website:
        try:
            import qrcode
            from reportlab.lib.utils import ImageReader
            qr = qrcode.QRCode(version=1, box_size=4, border=1)
            qr.add_data(website)
            qr.make(fit=True)
            qr_pil = qr.make_image(fill_color="black", back_color="white")
            buf = io.BytesIO()
            qr_pil.save(buf, format="PNG")
            buf.seek(0)
            qr_img_reader = ImageReader(buf)
        except Exception:
            qr_img_reader = None

    # ── Header height estimate ─────────────────────────────────────────────────
    HEADER_H = 28 * mm if show_header else 0
    FOOTER_H = 22 * mm if show_footer else 0
    frame_top    = H - margin_top - HEADER_H - 3 * mm
    frame_height = frame_top - margin_bottom - FOOTER_H

    # ── Page decorations callback ──────────────────────────────────────────────
    def draw_page_decorations(canvas, doc_obj):
        canvas.saveState()

        # Watermark (extremely subtle, elegant 3% opacity)
        if wm_img_reader:
            canvas.saveState()
            canvas.setFillAlpha(0.03)
            wm_size = min(W, H) * 0.55
            canvas.drawImage(
                wm_img_reader,
                (W - wm_size) / 2, (H - wm_size) / 2,
                width=wm_size, height=wm_size,
                mask='auto', preserveAspectRatio=True,
            )
            canvas.restoreState()

        # CONFIDENTIAL diagonal overlay
        if is_confidential:
            canvas.saveState()
            canvas.setFillColorRGB(0.8, 0, 0, alpha=0.08)
            canvas.setFont(fb, 60)
            canvas.translate(W / 2, H / 2)
            canvas.rotate(45)
            canvas.drawCentredString(0, 0, "CONFIDENTIAL")
            canvas.restoreState()

        # Company Header (two-column design)
        if show_header:
            hx = margin_left
            hy = H - margin_top - HEADER_H
            hw = CW

            # Header divider line (thin gray #cbd5e1)
            canvas.setStrokeColor(colors.HexColor("#cbd5e1"))
            canvas.setLineWidth(0.75)
            canvas.line(hx, hy, hx + hw, hy)

            # Left Side: Logo & Brand details
            logo_h = 14 * mm
            logo_w = 0
            if logo_img_reader:
                logo_y = hy + (HEADER_H - logo_h) / 2
                canvas.drawImage(
                    logo_img_reader, hx, logo_y,
                    width=22 * mm, height=logo_h,
                    mask='auto', preserveAspectRatio=True,
                )
                logo_w = 22 * mm + 4 * mm

            # Company name
            name_x = hx + logo_w
            name_y = hy + HEADER_H - 8 * mm
            canvas.setFont(fb, 16)
            canvas.setFillColor(colors.HexColor("#0f172a")) # Slate-900
            canvas.drawString(name_x, name_y, company_name)

            # Company address
            addr_parts = [p for p in [address, city, state, pincode] if p]
            addr_line = ", ".join(addr_parts)
            if addr_line:
                canvas.setFont(f, 8.5)
                canvas.setFillColor(colors.HexColor("#475569")) # Slate-600
                canvas.drawString(name_x, name_y - 6 * mm, addr_line)

            # Right Side: Contact info & licenses (right-aligned stacks)
            rx = W - margin_right
            ry = hy + HEADER_H - 6 * mm
            canvas.setFont(f, 7.5)
            canvas.setFillColor(colors.HexColor("#64748b"))

            contact_lines = []
            if mobile:
                contact_lines.append(("T:", mobile))
            if email:
                contact_lines.append(("E:", email))
            if website:
                contact_lines.append(("W:", website))

            for label, val in contact_lines:
                canvas.setFont(fb, 7.5)
                canvas.setFillColor(colors.HexColor("#94a3b8"))
                lbl_w = canvas.stringWidth(f"{label} ", fb, 7.5)
                val_w = canvas.stringWidth(val, f, 7.5)
                canvas.drawString(rx - lbl_w - val_w, ry, label)
                canvas.setFont(f, 7.5)
                canvas.setFillColor(colors.HexColor("#64748b"))
                canvas.drawString(rx - val_w, ry, val)
                ry -= 4.5 * mm

            # Add contact/license separator line & license detail block
            if gstin or drug_license:
                ry -= 1 * mm
                canvas.setStrokeColor(colors.HexColor("#e2e8f0"))
                canvas.setLineWidth(0.5)
                canvas.line(rx - 45 * mm, ry + 3 * mm, rx, ry + 3 * mm)

                canvas.setFont(f, 7)
                canvas.setFillColor(colors.HexColor("#94a3b8"))
                if gstin:
                    canvas.drawRightString(rx, ry, f"GSTIN: {gstin}")
                    ry -= 4 * mm
                if drug_license:
                    canvas.drawRightString(rx, ry, f"DL No: {drug_license}")

        # Footer
        if show_footer:
            fy = margin_bottom
            canvas.setStrokeColor(GLASS_BORDER)
            canvas.setLineWidth(0.4)
            canvas.line(margin_left, fy + FOOTER_H - 2 * mm, W - margin_right, fy + FOOTER_H - 2 * mm)

            # Thin divider color line (matching React UI)
            grad = GradientRect(CW, 1.5, colors.HexColor("#cbd5e1"), colors.HexColor("#cbd5e1"))
            grad.wrap(CW, 1.5)
            grad.drawOn(canvas, margin_left, fy)

            # Footer notes
            if footer_notes:
                fn_p = Paragraph(footer_notes, ParagraphStyle(
                    "LH_FN", fontName=f, fontSize=7, textColor=GREY, alignment=TA_LEFT
                ))
                fn_p.wrap(CW * 0.6, 20)
                fn_p.drawOn(canvas, margin_left, fy + 6 * mm)

            # Page numbers
            if show_pages:
                page_text = f"Page {canvas.getPageNumber()}"
                canvas.setFont(f, 7)
                canvas.setFillColor(GREY)
                canvas.drawRightString(W - margin_right, fy + 6 * mm, page_text)

            # QR code bottom left
            if qr_img_reader:
                qr_size = 15 * mm
                canvas.drawImage(
                    qr_img_reader,
                    margin_left, fy + 3 * mm,
                    width=qr_size, height=qr_size,
                    mask='auto', preserveAspectRatio=True,
                )

        # Centered Signature block on right-hand corner
        if show_sig and sig_img_reader:
            sig_h = 16 * mm
            sig_w = 45 * mm
            sig_x = W - margin_right - sig_w
            sig_y = margin_bottom + FOOTER_H + 3 * mm

            # Centered signature image
            canvas.drawImage(
                sig_img_reader, sig_x, sig_y + 8 * mm,
                width=sig_w, height=sig_h,
                mask='auto', preserveAspectRatio=True,
            )
            canvas.setStrokeColor(colors.HexColor("#cbd5e1"))
            canvas.setLineWidth(0.5)
            canvas.line(sig_x, sig_y + 7 * mm, sig_x + sig_w, sig_y + 7 * mm)

            sig_text = Paragraph(
                f'<font face="{f}" size="7" color="#94a3b8">AUTHORIZED SIGNATORY</font><br/>'
                f'<font face="{fb}" size="8" color="#0f172a">{company_name}</font>',
                ParagraphStyle("LH_SIG", alignment=TA_CENTER, leading=10),
            )
            sig_text.wrap(sig_w, 15 * mm)
            sig_text.drawOn(canvas, sig_x, sig_y)

        canvas.restoreState()

    # ── Document build ─────────────────────────────────────────────────────────
    doc = BaseDocTemplate(
        filepath,
        pagesize=A4,
        leftMargin=margin_left,
        rightMargin=margin_right,
        topMargin=margin_top + HEADER_H + 3 * mm,
        bottomMargin=margin_bottom + FOOTER_H,
    )

    frame = Frame(
        margin_left, margin_bottom + FOOTER_H,
        CW, H - margin_top - HEADER_H - margin_bottom - FOOTER_H - 3 * mm,
        id="main", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
    )
    template = PageTemplate(id="main", frames=[frame], onPage=draw_page_decorations)
    doc.addPageTemplates([template])

    # ── Story ──────────────────────────────────────────────────────────────────
    story = []

    # Reference + Document metadata block
    ref_val      = doc_data.get("reference", "")
    doc_date     = doc_data.get("date", "")
    subject      = doc_data.get("subject", "")
    customer     = doc_data.get("customer_name", "")
    title_text   = doc_data.get("title", "")

    if isinstance(doc_date, str) and doc_date:
        try:
            from datetime import datetime as _dt
            doc_date = _dt.fromisoformat(doc_date.replace("Z", "+00:00")).strftime("%d %B %Y")
        except Exception:
            pass
    elif hasattr(doc_date, "strftime"):
        doc_date = doc_date.strftime("%d %B %Y")

    # Meta block (Ref, Date, To) arranged in a balanced two-column grid
    import html
    left_parts = []
    if ref_val:
        left_parts.append(f'<font face="{fb}" size="8.5" color="#475569">Ref No: </font><font face="Courier" size="8.5" color="#0f172a">{html.escape(ref_val)}</font>')
    if customer:
        left_parts.append(f'<font face="{fb}" size="8.5" color="#475569">To: </font><font face="{fb}" size="8.5" color="#0f172a">{html.escape(customer)}</font>')

    left_html = "<br/>".join(left_parts)
    left_p = Paragraph(left_html, ParagraphStyle("LH_META_L", leading=13)) if left_parts else Paragraph("", ParagraphStyle("E"))

    right_parts = []
    if doc_date:
        right_parts.append(f'<font face="{fb}" size="8.5" color="#475569">Date: </font><font face="{f}" size="8.5" color="#0f172a">{html.escape(doc_date)}</font>')

    right_html = "<br/>".join(right_parts)
    right_p = Paragraph(right_html, ParagraphStyle("LH_META_R", alignment=TA_RIGHT, leading=13)) if right_parts else Paragraph("", ParagraphStyle("E"))

    if left_parts or right_parts:
        meta_tbl = Table(
            [[left_p, right_p]],
            colWidths=[CW * 0.65, CW * 0.35]
        )
        meta_tbl.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(meta_tbl)

    # Thin separator line matching React UI: borderBottom: '0.5px solid #f1f5f9'
    story.append(HRFlowable(width=CW, thickness=0.5, color=colors.HexColor("#f1f5f9"), spaceAfter=12))

    # Subject line styled with indigo left accent bar
    if subject:
        sub_p = Paragraph(
            f'<font face="{fb}" size="10" color="#0f172a">SUBJECT: {html.escape(subject).upper()}</font>',
            ParagraphStyle("LH_SUB_P", leading=12)
        )
        sub_tbl = Table([[sub_p]], colWidths=[CW])
        sub_tbl.setStyle(TableStyle([
            ('LINELEFT', (0, 0), (0, 0), 2.25, colors.HexColor("#6366f1")),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 1),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ]))
        story.append(sub_tbl)
        story.append(Spacer(1, 4 * mm))

    content = doc_data.get("content", "")
    if content:
        font_size = int(doc_data.get("font_size", 10))
        content_story = _parse_html_to_story(content, f, fb, CW, font_size=font_size)
        story.extend(content_story)
    else:
        story.append(Spacer(1, 20 * mm))

    # Build PDF
    def _build():
        doc.build(story)

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _build)

    return filepath

