<?php

namespace App\Http\Controllers;

use App\Models\MediaRequest;
use App\Services\RadarrService;
use App\Services\SonarrService;
use App\Services\TmdbService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class RequestController extends Controller
{
    public function __construct(
        private RadarrService $radarr,
        private SonarrService $sonarr,
        private TmdbService   $tmdb,
    ) {}

    public function index()
    {
        return response()->json(MediaRequest::latest()->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'tmdb_id'    => 'required|integer',
            'media_type' => 'required|in:movie,tv',
            'title'      => 'required|string',
            'poster_path'=> 'nullable|string',
            'overview'   => 'nullable|string',
            'genre_ids'  => 'nullable|array',
            'seasons'    => 'nullable|array',
        ]);

        if (MediaRequest::where('tmdb_id', $data['tmdb_id'])->where('media_type', $data['media_type'])->exists()) {
            return response()->json(['error' => 'Al aangevraagd'], 409);
        }

        $mr = MediaRequest::create([
            'tmdb_id'       => $data['tmdb_id'],
            'media_type'    => $data['media_type'],
            'title'         => $data['title'],
            'poster_path'   => $data['poster_path'] ?? '',
            'overview'      => $data['overview'] ?? '',
            'genre_ids'     => implode(',', $data['genre_ids'] ?? []),
            'seasons'       => implode(',', $data['seasons'] ?? []),
            'status'        => 'sending',
            'status_message'=> 'Wordt verstuurd…',
            'requested_by'  => $request->user()->username,
        ]);

        try {
            if ($data['media_type'] === 'movie') {
                $result = $this->radarr->sendMovie($data['tmdb_id'], $data['title']);
                $mr->update(['status' => $result['status'], 'status_message' => $result['message'], 'radarr_id' => $result['radarr_id'] ?? null]);
            } else {
                $seasons = array_filter(array_map('intval', $data['seasons'] ?? []), fn($n) => $n > 0);
                $result = $this->sonarr->sendSeries($data['tmdb_id'], $data['title'], $seasons, $this->tmdb);
                $mr->update(['status' => $result['status'], 'status_message' => $result['message'], 'sonarr_id' => $result['sonarr_id'] ?? null]);
            }
        } catch (\Exception $e) {
            $mr->update(['status' => 'failed', 'status_message' => substr($e->getMessage(), 0, 500)]);
        }

        return response()->json($mr->fresh(), 201);
    }

    public function retry(int $id)
    {
        $mr = MediaRequest::findOrFail($id);
        $mr->update(['status' => 'sending', 'status_message' => 'Opnieuw proberen…']);

        try {
            if ($mr->media_type === 'movie') {
                $result = $this->radarr->sendMovie($mr->tmdb_id, $mr->title);
                $mr->update(['status' => $result['status'], 'status_message' => $result['message'], 'radarr_id' => $result['radarr_id'] ?? null]);
            } else {
                $seasons = array_filter(array_map('intval', explode(',', $mr->seasons ?? '')), fn($n) => $n > 0);
                $result = $this->sonarr->sendSeries($mr->tmdb_id, $mr->title, $seasons, $this->tmdb);
                $mr->update(['status' => $result['status'], 'status_message' => $result['message'], 'sonarr_id' => $result['sonarr_id'] ?? null]);
            }
        } catch (\Exception $e) {
            $mr->update(['status' => 'failed', 'status_message' => substr($e->getMessage(), 0, 500)]);
        }

        return response()->json($mr->fresh());
    }

    public function destroy(int $id)
    {
        MediaRequest::findOrFail($id)->delete();
        return response()->json(['success' => true]);
    }
}
