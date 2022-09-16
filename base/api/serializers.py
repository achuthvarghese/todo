from rest_framework import serializers

from base.models import Task


class TaskSerializer(serializers.HyperlinkedModelSerializer):
    url = serializers.HyperlinkedIdentityField(view_name="base:task-detail")

    class Meta:
        model = Task
        fields = "__all__"
