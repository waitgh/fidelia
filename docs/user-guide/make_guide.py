"""Builds the Fidelia Ledger user guide (non-technical) as a PDF.

Run: python3 -m venv /tmp/v && /tmp/v/bin/pip install reportlab pillow && /tmp/v/bin/python docs/user-guide/make_guide.py docs/user-guide/Fidelia-User-Guide.pdf
Uses macOS fonts (Arial, Georgia). Screenshots come from the demo (sample data only).
"""
import sys
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Image,
                                Table, TableStyle, PageBreak, KeepTogether, ListFlowable, ListItem)
from PIL import Image as PILImage

HERE = Path(__file__).parent
OUT = Path(sys.argv[1])
FONTS = Path('/System/Library/Fonts/Supplemental')
pdfmetrics.registerFont(TTFont('Body', str(FONTS / 'Arial.ttf')))
pdfmetrics.registerFont(TTFont('BodyB', str(FONTS / 'Arial Bold.ttf')))
pdfmetrics.registerFont(TTFont('BodyI', str(FONTS / 'Arial Italic.ttf')))
pdfmetrics.registerFont(TTFont('BodyBI', str(FONTS / 'Arial Bold Italic.ttf')))
pdfmetrics.registerFont(TTFont('Head', str(FONTS / 'Georgia.ttf')))
pdfmetrics.registerFont(TTFont('HeadB', str(FONTS / 'Georgia Bold.ttf')))
pdfmetrics.registerFontFamily('Body', normal='Body', bold='BodyB', italic='BodyI', boldItalic='BodyBI')

INK = colors.HexColor('#1f1d3d')
PURPLE = colors.HexColor('#3f3aa8')
GOLD = colors.HexColor('#b8860b')
SOFT = colors.HexColor('#eef0fb')
WARN = colors.HexColor('#fff6dd')
GREY = colors.HexColor('#5b5b6b')
SITE = 'https://fidelia.pages.dev'

body = ParagraphStyle('body', fontName='Body', fontSize=11.5, leading=16.5, textColor=INK, spaceAfter=6)
small = ParagraphStyle('small', parent=body, fontSize=9.5, leading=13, textColor=GREY)
h1 = ParagraphStyle('h1', fontName='HeadB', fontSize=21, leading=26, textColor=INK, spaceBefore=4, spaceAfter=10)
h2 = ParagraphStyle('h2', fontName='HeadB', fontSize=14.5, leading=19, textColor=PURPLE, spaceBefore=12, spaceAfter=6)
caption = ParagraphStyle('cap', parent=small, alignment=TA_CENTER, spaceBefore=3, spaceAfter=10)
box = ParagraphStyle('box', parent=body, spaceAfter=0)


def b(text):  # a button or label name in the app
    return f'<font name="BodyB" color="#3f3aa8">{text}</font>'


def P(text, style=body):
    return Paragraph(text, style)


def steps(items, style=body, start=1):
    return ListFlowable([ListItem(P(t, style), leftIndent=18, value=i + start) for i, t in enumerate(items)],
                        bulletType='1', bulletFontName='HeadB', bulletColor=PURPLE, leftIndent=18, spaceAfter=6)


def bullets(items):
    return ListFlowable([ListItem(P(t), leftIndent=14) for t in items], bulletType='bullet', start='•',
                        bulletColor=PURPLE, leftIndent=14, spaceAfter=6)


def callout(text, bg=SOFT, border=PURPLE):
    t = Table([[P(text, box)]], colWidths=[6.5 * inch])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), bg), ('LINEBEFORE', (0, 0), (0, -1), 3, border),
                           ('LEFTPADDING', (0, 0), (-1, -1), 12), ('RIGHTPADDING', (0, 0), (-1, -1), 12),
                           ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8)]))
    return KeepTogether([Spacer(1, 4), t, Spacer(1, 8)])


def shot(name, text, width=6.5 * inch):
    path = HERE / name
    w, h = PILImage.open(path).size
    img = Image(str(path), width=width, height=width * h / w)
    frame = Table([[img]], colWidths=[width + 2])
    frame.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#c9cbe0')),
                               ('LEFTPADDING', (0, 0), (-1, -1), 1), ('RIGHTPADDING', (0, 0), (-1, -1), 1),
                               ('TOPPADDING', (0, 0), (-1, -1), 1), ('BOTTOMPADDING', (0, 0), (-1, -1), 1)]))
    return KeepTogether([frame, P(text, caption)])


def side(left, right):  # text beside a picture
    t = Table([[left, right]], colWidths=[3.4 * inch, 3.1 * inch])
    t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0),
                           ('RIGHTPADDING', (0, 0), (0, -1), 14), ('RIGHTPADDING', (1, 0), (1, -1), 0)]))
    return t


def on_page(c, doc):
    if doc.page == 1:
        return
    c.saveState()
    c.setFont('Body', 8.5)
    c.setFillColor(GREY)
    c.drawString(inch, 0.55 * inch, 'Fidelia Ledger · Treasurer’s guide')
    c.drawRightString(7.5 * inch, 0.55 * inch, f'Page {doc.page}')
    c.restoreState()


def cover(c, doc):
    c.saveState()
    c.setFillColor(colors.HexColor('#0f0d2e'))
    c.rect(0, 0, letter[0], letter[1], stroke=0, fill=1)
    c.setFillColor(colors.HexColor('#fde047'))
    c.setFont('HeadB', 40)
    c.drawCentredString(letter[0] / 2, 7.3 * inch, 'Fidelia Ledger')
    c.setFillColor(colors.white)
    c.setFont('Head', 20)
    c.drawCentredString(letter[0] / 2, 6.7 * inch, 'A simple guide for church treasurers')
    c.setFont('Body', 12.5)
    c.setFillColor(colors.HexColor('#c9c8ee'))
    c.drawCentredString(letter[0] / 2, 6.0 * inch, 'Record offerings, keep donor records, and print year-end statements,')
    c.drawCentredString(letter[0] / 2, 5.75 * inch, 'all in your web browser. Nothing to install.')
    c.setFillColor(colors.white)
    c.setFont('Body', 13)
    c.drawCentredString(letter[0] / 2, 4.6 * inch, 'Open it at')
    c.setFillColor(colors.HexColor('#fde047'))
    c.setFont('HeadB', 18)
    c.drawCentredString(letter[0] / 2, 4.2 * inch, SITE.replace('https://', ''))
    c.setFillColor(colors.HexColor('#c9c8ee'))
    c.setFont('Body', 10.5)
    c.drawCentredString(letter[0] / 2, 3.8 * inch, 'New address. If you saved the old one (fidelia-browser.pages.dev), update your bookmark.')
    c.restoreState()


story = [PageBreak()]

# 1
story += [P('1. What Fidelia is', h1),
          P('Fidelia Ledger keeps your church’s offering records: who gave, how much, to which fund, and how. '
            'It runs in a web browser on a computer, tablet or iPhone. There is nothing to download or install.'),
          bullets([
              f'{b("Private.")} Your records are locked (encrypted) on your own device before they are saved. Only people '
              'with a Fidelia password for your church can read them. The people who run the website cannot.',
              f'{b("Kept in your own Dropbox.")} The locked file lives in your church’s Dropbox account, not on our computers.',
              f'{b("Shared safely.")} Several treasurers can use it, each with their own name and password, and the '
              'Audit Log shows who changed what.',
          ]),
          P('What you need', h2),
          bullets(['A computer, tablet or iPhone with any up-to-date web browser (Safari, Chrome, Edge or Firefox).',
                   'An internet connection.',
                   'A free Dropbox account (dropbox.com). Each treasurer uses their own.']),
          callout('<b>Want to look around first?</b> On the welcome screen, click <i>Just looking? Try the demo</i>. '
                  'The demo uses made-up data and nothing you do there is saved.')]

# 2
story += [PageBreak(), P('2. Setting up your church (one time)', h1),
          P('One person, usually the head treasurer, does this once. It takes about five minutes.'),
          shot('welcome.png', 'The welcome screen', width=3.2 * inch),
          steps([
              f'Go to {b(SITE.replace("https://", ""))} and click {b("Create a church account")}.',
              f'{b("Step 1:")} type the church name, your full name (how others will see you), and a short '
              f'{b("sign-in name")} with no spaces, for example <i>grace</i>. Click {b("Next")}.',
              f'{b("Step 2:")} choose {b("Dropbox")}. Click {b("Sign in to Dropbox and choose a folder")}, sign in, '
              f'and allow Fidelia to use your Dropbox. Pick a folder, or tap {b("New folder here")} to make one, '
              f'for example <i>Fidelia</i>. Then click {b("Use")}. Keep the church file in its own folder, because later you '
              'share that folder with the other treasurers.',
              f'{b("Step 3:")} choose a password (8 or more characters) and type it twice. Click {b("Create church account")}.',
              f'{b("Print the recovery key")} and keep it somewhere safe, like the church office safe. Tick the box, '
              f'then click {b("Continue")}.',
          ]),
          callout('<b>Very important: the recovery key.</b> There is no “forgot password” email. If every admin forgets '
                  'their password, the printed recovery key is the only way back into your records. Keep it safe, '
                  'and never share it by email or text.', bg=WARN, border=GOLD)]

# 3
story += [PageBreak(), P('3. Adding other treasurers', h1),
          P('Every person gets their own sign-in name and password. Don’t share yours. Add at least one more '
            'admin so the church is never locked out if one person is away.'),
          P('What the admin does', h2),
          steps([
              f'In Fidelia, open {b("Members")} and click {b("Invite someone")}.',
              f'Choose what they will be: {b("Admin")} (everything), {b("Bookkeeper")} (offerings, donors, pledges, reports) '
              f'or {b("Viewer")} (look only). Click {b("Create invite code")}.',
              f'In Dropbox, {b("share the church’s folder")} with the person’s email address. The screen tells you which '
              f'folder. Leave {b("Can edit")} on, even for viewers. Fidelia itself keeps viewers read-only.',
              'Send them the invite code by text or email. It works once and expires after 14 days.',
              'Sign out of Fidelia when you have sent it, so they can finish joining.',
          ]),
          P('What the new person does', h2),
          steps([
              f'Open the invitation email from Dropbox and click {b("Open")} or {b("Add to Dropbox")}.',
              f'Go to {b(SITE.replace("https://", ""))}, click {b("Sign in")}, then {b("Dropbox")}, and sign in to '
              'their own Dropbox.',
              f'Choose the church. If it isn’t listed yet, wait a minute and click {b("Look again")}, or use '
              f'{b("Browse my Dropbox")} to find it.',
              f'Click {b("I have an invite code")}, type the code, and choose their own full name, sign-in name and password.',
          ]),
          callout('Admins can see unused invites under <b>Members</b> and cancel one with <b>Revoke</b>.')]

# 4
story += [PageBreak(), P('4. Signing in', h1),
          steps([
              f'Go to {b(SITE.replace("https://", ""))} and click {b("Sign in")}. Fidelia remembers your church on '
              'this device, so this usually takes you straight there.',
              'If asked, sign in to Dropbox.',
              f'Type your {b("sign-in name")} and {b("password")}.',
          ]),
          shot('dashboard.jpg', 'The Dashboard: this month, this year, recent batches, and totals by fund'),
          bullets([f'Treasurer for more than one church? On the sign-in screen, click {b("Different church")} to see the list '
                   f'of church files again. {b("Use a different Dropbox account")} lets you switch to another Dropbox.',
                   f'Fidelia signs you out after 15 minutes without activity. Click {b("Sign out")} (bottom left) when you finish, '
                   'especially on a shared computer.',
                   f'Forgot your password? Ask an admin to set a new one under {b("Members")}. If no admin can sign in, '
                   f'use {b("Forgot password? Use the recovery key")}.'])]

# 5
story += [PageBreak(), P('5. Recording a Sunday offering', h1),
          P('Each collection, for example one Sunday’s offering, goes into a <b>batch</b>. You add each gift to the batch, '
            'check the total against the money counted, then close the batch.'),
          side(steps([f'Click {b("Batches")}, then {b("New Batch")}. Pick the date and add a short description.']),
               shot('batches.jpg', 'Batches: open batches are yellow, closed ones are green', width=3.1 * inch)._content),
          steps([
              f'In the batch, click {b("Add Offering")}. Choose the {b("donor")} (start typing their name), type the '
              f'{b("amount")}, and pick the {b("fund")} (General, Building, Mercy, Mission…) and the {b("method")} '
              f'(cash, check, Zelle…). For a check, type the check number. Leave {b("Designation")} blank unless the gift '
              'is for someone specific (see section 7).',
              f'Click {b("Add Offering")} to save it, and repeat for each gift. New giver? Use the small '
              f'{b("person icon")} next to the donor box to add them quickly.',
              f'Type the {b("Attendance")} (adults and children) in the box under the total. It saves by itself.',
              f'Compare the {b("By Fund and Method")} table with the money counted. It shows cash and checks separately for '
              'each fund, with the number of gifts for each. Fix any line with the pencil icon.',
              f'Click {b("Close Batch")} when it matches. A closed batch can be reopened later if needed.',
          ], start=2),
          shot('offering.jpg', 'Adding an offering to a batch. The Designation box is on the right.', width=5.2 * inch)]

# 5b
story += [PageBreak(), P('6. The batch page and the summary sheet', h1),
          P('Every batch shows its total, the attendance, and a table of funds by payment method: each fund has its own '
            'cash and check subtotals, and the bottom row gives the cash total, the check total and the grand total. '
            'This is the same layout as a paper counting sheet.'),
          shot('batch.jpg', 'A batch: totals and attendance on the left, the fund-by-method table on the right'),
          side(P(f'Click {b("Summary Sheet")} at the top of the batch to save a one-page PDF to print or file. It has the date, '
            'attendance, number of checks, the fund-by-method table (with missionary designations), fees and net, and '
            '“Counted by” and “Verified by” lines to sign. It can replace a hand-written summary sheet. While the batch '
            'is still open, the sheet is marked <i>Draft</i>.'),
               shot('summary-sheet.jpg', 'The Summary Sheet PDF', width=2.9 * inch)._content)]

story += [PageBreak(), P('7. Gifts to a specific missionary (designations)', h1),
          P('Most Mission gifts go to the Mission fund in general. If a giver names a missionary, record it like this:'),
          steps([
              f'Choose the {b("Mission")} fund as usual.',
              f'Type the missionary’s name in the {b("Designation")} box, for example <i>Smith family (Kenya)</i>. '
              'There is nothing to set up first. The box suggests names already used, which keeps the spelling the same.',
              'Leave the box blank for ordinary gifts.',
          ]),
          bullets([
              'Designations work on any fund, not only Mission (for example a Building gift for the roof).',
              f'In the batch list, the gift shows <i>for Smith family (Kenya)</i> under the fund. In the '
              f'{b("By Fund and Method")} table and in Reports, the fund is broken down by name, with the rest shown as '
              '<i>Undesignated</i>.',
              'The designation also appears on the donor’s year-end statement.',
              f'To add one to a gift already entered: open the batch, click {b("Reopen")} if it is closed, click the pencil '
              f'on the gift, type the name, save, then {b("Close Batch")} again.',
          ]),
          P('Export and import', h2),
          bullets([
              f'{b("Zelle gifts:")} in an open batch, {b("Import")} can read a Zelle bank statement and add the gifts for '
              'you. Check the donors and funds before saving.',
              f'{b("Export")} on a batch page saves the batch as a spreadsheet file (CSV) that opens in Excel, Numbers or '
              'Google Sheets, with a total row at the bottom.',
              f'{b("Batches → Import CSV")} reads a file made by Export (for example from another church file, or after '
              'fixing it in a spreadsheet) and creates the batch again. Fidelia shows a preview first: the batches, any '
              'new donors it will add, and any problems. Nothing is saved until you click Import. If a batch looks like '
              'one you already have, it warns you so you don’t enter it twice.',
          ])]

# 6
story += [PageBreak(), P('8. Donors, pledges and funds', h1),
          bullets([
              f'{b("Donors:")} add or edit names, addresses, phone numbers and envelope numbers. Addresses are used on statements.',
              f'{b("Pledges:")} record a promise, such as $1,200 to the Building fund this year. Fidelia shows how much has been given so far.',
              f'{b("Settings:")} church name and address, the funds (categories) offerings can go to, and the wording of the donor letter. '
              'A new church starts with the funds General, Building, Mercy and Mission. Add, rename or remove them here.',
          ]),
          P('9. Reports and year-end statements', h1),
          steps([
              f'Click {b("Reports")}. Choose a {b("Report Type")}: {b("Summary")} (totals by fund with cash and check subtotals, '
              f'missionary designations, and average attendance), '
              f'{b("Donor Statement")} (what each person gave, for tax receipts) or {b("Trends")} (giving over time).',
              f'Choose the dates, for example January 1 to December 31, and click {b("Generate Report")}.',
              f'Click {b("Preview PDF")} to look at it, or {b("Export PDF")} to save and print it.',
          ]),
          shot('report.jpg', 'A summary report: each fund, by payment method'),
          callout('<b>Emailing statements:</b> if your helper has turned on email sending, Donor Statement shows an '
                  '<b>Email Statements</b> button. Use a laptop for this. If sending stops partway, open it again: '
                  'it continues with the people not yet sent.')]

# 8
story += [PageBreak(), P('10. Good to know', h1),
          bullets([
              f'{b("Saving is automatic.")} The bottom-left corner shows <i>Saved</i> or <i>Saving…</i>. Wait for <i>Saved</i> before closing.',
              f'{b("One editor at a time.")} If someone else is editing, you see their name and can still look at everything. '
              'Fidelia switches you to editing by itself when they finish. If the name is your own, you probably left '
              f'Fidelia open in another window, tab or device: close it, or click {b("Edit here instead")}.',
              f'{b("Mistakes can be undone.")} Admins can go back to an earlier save under {b("Data & Backup → Previous versions")}.',
              f'{b("Extra backup.")} {b("Data & Backup → Download encrypted backup")} saves a locked copy you can keep elsewhere. '
              'It opens with the same passwords.',
              f'{b("In Dropbox, you may move or rename")} the church file or its folder; others just choose it again. '
              f'{b("Don’t copy it or upload an old copy over it")}, because that can lose recent changes.',
              f'{b("Who did what:")} admins can see every change in the {b("Audit Log")}.',
          ]),
          PageBreak(), P('11. If something goes wrong', h1)]

rows = [['What you see', 'What to do'],
        ['“No church file found” after signing in to Dropbox',
         'Make sure you accepted Dropbox’s invitation email. Wait a minute, then click Look again, or use Browse my Dropbox.'],
        ['“… is editing right now, so you can only view”',
         'Someone else is editing. Wait, or ask them to sign out. Fidelia switches you over by itself. If it’s your own name, '
         'close Fidelia on your other window or device, or click Edit here instead.'],
        ['Settings, Donors or Members are missing from the menu',
         'You are in view-only mode because someone (maybe you, in another window) is editing. See the line above.'],
        ['Forgot your password', 'Ask an admin to set a new one under Members.'],
        ['Every admin forgot their password', 'Use the printed recovery key: Sign in → Forgot password? Use the recovery key.'],
        ['Entered something wrong', 'Fix it with the pencil icon, or an admin can restore an earlier save under Data & Backup.'],
        ['Need help from someone', 'Data & Backup → Copy diagnostics copies a short report with no names or amounts. Email it to your helper.']]
tbl = Table([[P(c, ParagraphStyle('t', parent=body, fontSize=10, leading=13.5, spaceAfter=0)) for c in r] for r in rows],
            colWidths=[2.4 * inch, 4.1 * inch], repeatRows=1)
tbl.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), SOFT), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                         ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor('#d8d9e8')),
                         ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
story += [tbl, Spacer(1, 14),
          callout('<b>Keep these safe:</b> your password (don’t share it), the printed recovery key, and access to the '
                  'church Dropbox folder.')]

doc = BaseDocTemplate(str(OUT), pagesize=letter, leftMargin=inch, rightMargin=inch, topMargin=0.85 * inch,
                      bottomMargin=0.85 * inch, title='Fidelia Ledger: a simple guide for church treasurers',
                      author='Fidelia Ledger', subject='User guide')
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='f')
doc.addPageTemplates([PageTemplate(id='cover', frames=[frame], onPage=cover),
                      PageTemplate(id='body', frames=[frame], onPage=on_page)])
from reportlab.platypus import NextPageTemplate
doc.build([NextPageTemplate('body')] + story)
print('wrote', OUT)
