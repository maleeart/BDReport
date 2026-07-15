from pptx import Presentation

prs = Presentation('templateReport.pptx')
slide = prs.slides[1]
rels = slide.part.rels
print("Rels object type:", type(rels))
print("Available methods/attributes in rels:")
for item in dir(rels):
    if not item.startswith('_'):
        print(f"  {item}")
