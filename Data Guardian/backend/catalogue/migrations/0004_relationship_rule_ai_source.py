from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalogue", "0003_relationship_rule"),
    ]

    operations = [
        migrations.AlterField(
            model_name="relationshiprule",
            name="source",
            field=models.CharField(
                choices=[
                    ("fk",     "Foreign Key Constraint"),
                    ("name",   "Name-based Detection"),
                    ("ai",     "AI Inference"),
                    ("manual", "Manual"),
                ],
                default="manual",
                max_length=10,
            ),
        ),
    ]
