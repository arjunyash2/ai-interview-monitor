from django.urls import path
from . import views

urlpatterns = [
    path('sessions/', views.list_sessions, name='list_sessions'),
    path('sessions/start/', views.start_session, name='start_session'),
    path('sessions/<uuid:session_id>/', views.get_session, name='get_session'),
    path('sessions/<uuid:session_id>/end/', views.end_session, name='end_session'),
    path('sessions/<uuid:session_id>/events/', views.log_event, name='log_event'),
    path('sessions/<uuid:session_id>/emotions/', views.log_emotion_snapshot, name='log_emotion'),
    path('dashboard/', views.dashboard_stats, name='dashboard_stats'),
]