from pathlib import Path
import shutil

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "Andrew_Chung_Public_CV.pdf"
SITE_COPY = ROOT / "assets" / "documents" / "Andrew_Chung_Public_CV.pdf"

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
SITE_COPY.parent.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = A4
MARGIN_X = 16 * mm
MARGIN_TOP = 13 * mm
MARGIN_BOTTOM = 13 * mm

NAVY = colors.HexColor("#102C44")
BLUE = colors.HexColor("#17679A")
INK = colors.HexColor("#15202A")
MUTED = colors.HexColor("#52616D")
LINE = colors.HexColor("#D9E1E7")
PALE = colors.HexColor("#EDF5FA")


def register_fonts():
    candidates = [
        ("DejaVu", Path("C:/Windows/Fonts/DejaVuSans.ttf"), Path("C:/Windows/Fonts/DejaVuSans-Bold.ttf")),
        ("Aptos", Path("C:/Windows/Fonts/Aptos.ttf"), Path("C:/Windows/Fonts/Aptos-Bold.ttf")),
        ("Arial", Path("C:/Windows/Fonts/arial.ttf"), Path("C:/Windows/Fonts/arialbd.ttf")),
    ]
    for family, regular, bold in candidates:
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont(f"{family}-Regular", str(regular)))
            pdfmetrics.registerFont(TTFont(f"{family}-Bold", str(bold)))
            return f"{family}-Regular", f"{family}-Bold"
    return "Helvetica", "Helvetica-Bold"


FONT, FONT_BOLD = register_fonts()

styles = getSampleStyleSheet()
name_style = ParagraphStyle(
    "Name",
    fontName=FONT_BOLD,
    fontSize=22,
    leading=24,
    textColor=NAVY,
    spaceAfter=2,
)
role_style = ParagraphStyle(
    "Role",
    fontName=FONT,
    fontSize=9.5,
    leading=12,
    textColor=MUTED,
)
contact_style = ParagraphStyle(
    "Contact",
    fontName=FONT,
    fontSize=7.8,
    leading=10,
    textColor=BLUE,
    alignment=TA_RIGHT,
)
section_style = ParagraphStyle(
    "Section",
    fontName=FONT_BOLD,
    fontSize=9.2,
    leading=11,
    textColor=NAVY,
    spaceBefore=5,
    spaceAfter=3,
    borderWidth=0,
    borderColor=LINE,
)
entry_title_style = ParagraphStyle(
    "EntryTitle",
    fontName=FONT_BOLD,
    fontSize=8.5,
    leading=10.5,
    textColor=INK,
)
entry_meta_style = ParagraphStyle(
    "EntryMeta",
    fontName=FONT,
    fontSize=7.5,
    leading=9.2,
    textColor=MUTED,
    alignment=TA_RIGHT,
)
body_style = ParagraphStyle(
    "Body",
    fontName=FONT,
    fontSize=7.6,
    leading=9.6,
    textColor=INK,
    spaceAfter=1.5,
)
bullet_style = ParagraphStyle(
    "Bullet",
    parent=body_style,
    leftIndent=8,
    firstLineIndent=-5,
    bulletIndent=0,
    spaceAfter=0.8,
)
small_style = ParagraphStyle(
    "Small",
    fontName=FONT,
    fontSize=7.2,
    leading=9,
    textColor=INK,
)


def section(title):
    return Table(
        [[Paragraph(title.upper(), section_style), ""]],
        colWidths=[45 * mm, None],
        style=TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                ("LINEBELOW", (0, 0), (-1, -1), 0.6, BLUE),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
            ]
        ),
    )


def entry(company, role, dates, bullets):
    heading = Table(
        [[Paragraph(f"{company}<br/><font color='#52616D'>{role}</font>", entry_title_style), Paragraph(dates, entry_meta_style)]],
        colWidths=[PAGE_W - (2 * MARGIN_X) - 36 * mm, 36 * mm],
        style=TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
            ]
        ),
    )
    content = [heading]
    for bullet in bullets:
        content.append(Paragraph(f"• {bullet}", bullet_style))
    return KeepTogether(content)


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN_X, 9 * mm, PAGE_W - MARGIN_X, 9 * mm)
    canvas.setFont(FONT, 6.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN_X, 5.7 * mm, "Public CV - private phone and address details removed")
    canvas.drawRightString(PAGE_W - MARGIN_X, 5.7 * mm, f"Andrew Chung / {doc.page}")
    canvas.restoreState()


doc = BaseDocTemplate(
    str(OUTPUT),
    pagesize=A4,
    leftMargin=MARGIN_X,
    rightMargin=MARGIN_X,
    topMargin=MARGIN_TOP,
    bottomMargin=MARGIN_BOTTOM,
    title="Andrew Chung - Public CV",
    author="Andrew Chung",
    subject="Electrical engineering, embedded systems and robotics",
)
frame = Frame(
    MARGIN_X,
    MARGIN_BOTTOM,
    PAGE_W - 2 * MARGIN_X,
    PAGE_H - MARGIN_TOP - MARGIN_BOTTOM,
    leftPadding=0,
    rightPadding=0,
    topPadding=0,
    bottomPadding=0,
)
doc.addPageTemplates([PageTemplate(id="cv", frames=[frame], onPage=footer)])

story = []
header = Table(
    [[
        Paragraph("Andrew Chung", name_style),
        Paragraph(
            "andrew.noah.chung@gmail.com<br/>linkedin.com/in/22anc<br/>proccyboi.github.io/",
            contact_style,
        ),
    ], [Paragraph("Electrical engineering / embedded systems / robotics", role_style), ""]],
    colWidths=[PAGE_W - 2 * MARGIN_X - 62 * mm, 62 * mm],
    style=TableStyle(
        [
            ("SPAN", (1, 0), (1, 1)),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]
    ),
)
story.extend([header, Spacer(1, 4)])

story.append(section("Professional experience"))
story.append(entry(
    "Switchmode Power Supplies Pty Ltd",
    "Electronics Engineer Trainee",
    "Jun. 2026 - Present",
    ["Maintenance, testing and repair of low- and high-voltage power supplies and equipment."],
))
story.append(entry(
    "UNSW Electrical Engineering and Telecommunications Society",
    "President",
    "Sep. 2024 - Jan. 2026",
    [
        "Managed a team of 50+ students working with faculty, industry and alumni.",
        "Delivered 100+ events in 2025, achieving 2.5 million views and 4,000 hours of course support.",
    ],
))
story.append(entry(
    "UNSW Casual Academic",
    "Senior Lab Demonstrator",
    "Dec. 2023 - Present",
    [
        "Teaching, assessment and practical workshops across ELEC1111, ELEC2133, ELEC3106, ELEC3117, ELEC4123, DESN1000 and DESN2000.",
    ],
))
story.append(entry(
    "UNSW Deans Engineering Unit",
    "Student Ambassador",
    "Sep. 2023 - Present",
    ["Advises prospective students and supports engineering outreach events, registration and guest logistics."],
))

story.append(section("Education"))
story.append(entry(
    "University of New South Wales",
    "Bachelor of Electrical Engineering (Honours) / Master of Electrical Engineering",
    "2023 - 2027",
    ["Coursework across microelectronics, electrical systems, analogue and digital circuits, programming and networks."],
))

story.append(section("Selected projects"))
story.append(entry(
    "UNSW Skylabs",
    "Avionics & Payload Team Lead",
    "Aug. 2025 - Present",
    [
        "Designed, built and tested ESP32-based telemetry hardware integrating GNSS, IMU, differential-pressure, atmospheric, temperature, humidity and strain sensing, plus ESC interfacing.",
        "Represented UNSW at the AIAA Design/Build/Fly competition in Wichita, Kansas.",
    ],
))
story.append(entry(
    "rUNSWift",
    "Behaviours / Hardware Team Member",
    "Dec. 2024 - Present",
    [
        "Develops and tests Python/C++ ROS2 software for NAO V5/6 and Booster K1 humanoid robots in RoboCup's Standard Platform League (SPL).",
        "Prepared and led the Sydney team at RoboCup 2025 in Salvador, Brazil.",
    ],
))
story.append(entry(
    "LoRa Talkie / Dash / Metroboard",
    "Personal embedded-systems projects",
    "Selected work",
    [
        "LoRa Morse-code walkie-talkie with a custom C++ GUI; ESP32 safe-driving detector with sensing, audio, display, battery management and custom housing; live Sydney rail indicator with 290+ LEDs, Wi-Fi and TfNSW GTFS real-time data.",
    ],
))

story.append(section("Skills and recognition"))
skills = Table(
    [[
        Paragraph("<b>Technical</b><br/>C, C++, Python, Assembly, KiCad, LTspice, MATLAB, Simulink, ROS2, PCB design, embedded systems, RF/GNSS, electronics testing and repair", small_style),
        Paragraph("<b>Recognition</b><br/>Australian Defence Force Future Innovators Award (2020); City of Ryde Young Volunteer of the Year nominee (2022); Duke of Edinburgh Bronze", small_style),
    ]],
    colWidths=[(PAGE_W - 2 * MARGIN_X) * 0.58, (PAGE_W - 2 * MARGIN_X) * 0.42],
    style=TableStyle(
        [
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BACKGROUND", (0, 0), (-1, -1), PALE),
            ("BOX", (0, 0), (-1, -1), 0.5, LINE),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]
    ),
)
story.append(skills)

doc.build(story)
shutil.copy2(OUTPUT, SITE_COPY)
print(f"Wrote {OUTPUT}")
print(f"Wrote {SITE_COPY}")
