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
        
        # Bottom gradient bar at y = 1.0 * mm (absolute bottom area)
        grad = GradientRect(CW, 2.0, GLASS_ACCENT, TEAL)
        grad.wrap(CW, 2.0)
        grad.drawOn(canvas, LM, 1.0 * mm)
        
        # Computer generated timestamp at y = 5.0 * mm (sits above the gradient bar)
        cg_p = Paragraph(
            f"Computer generated invoice | {datetime.now().strftime('%d-%m-%Y %H:%M')}",
            ParagraphStyle("GN_canvas", fontName=f, fontSize=5.5, textColor=SILVER, alignment=TA_CENTER)
        )
        cg_p.wrap(CW, 8)
        cg_p.drawOn(canvas, LM, 5.0 * mm)
        
        canvas.restoreState()

    doc.build(story)
    return filepath
