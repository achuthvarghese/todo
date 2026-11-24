from django.contrib.auth.forms import UserCreationForm


class SignUpForm(UserCreationForm):
    """Self-service sign-up. Accounts created here are regular users."""

    class Meta(UserCreationForm.Meta):
        fields = ("username",)

    def save(self, commit=True):
        user = super().save(commit=False)
        user.is_staff = False
        user.is_superuser = False
        if commit:
            user.save()
        return user
