DEFAULT_DESCRIPTION = (
    "todo. is a bold, simple task manager: list your tasks, move them across "
    "a board and see your progress in clear statistics."
)


def seo(request):
    return {"default_description": DEFAULT_DESCRIPTION}
