from rest_framework import serializers

from base.models import Task


class TaskSerializer(serializers.ModelSerializer):
    url = serializers.HyperlinkedIdentityField(view_name="base:task-detail")

    class Meta:
        model = Task
        fields = (
            "id",
            "url",
            "title",
            "description",
            "status",
            "created_at",
            "updated_at",
            "completed_at",
        )
        read_only_fields = ("id", "created_at", "updated_at", "completed_at")

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Title cannot be blank.")
        return value
